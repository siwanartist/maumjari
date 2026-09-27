/**
 * 예약·결제·환불·정산 상태 전환 — 이 파일이 서비스의 핵심 규칙이다.
 *
 * 결제 방식: 선결제 + 조건부 자동환불 (기획안 8.2 B안)
 *   예약 요청 시 즉시 결제 → 지도자 승인 시 예약 확정
 *   지도자 거절 / 응답기한 초과 → 전액 자동 환불
 *
 * 동시성: 모든 상태 변경은 트랜잭션 + 행 잠금(SELECT ... FOR UPDATE)으로 처리해
 *   정원 초과 예약, 이중 결제 승인, 이중 환불을 막는다.
 */
import { and, eq, gt, inArray, lt, lte, or, sql, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, schema, type Tx } from "@/db";
import { ApiError } from "./api";
import { env } from "./env";
import { getPaymentProvider } from "./payments";
import { deliver, type Notice } from "./notify";
import { userCancelRefund, AUTO_COMPLETE_HOURS } from "./policy";
import { PAYMENT_HOLD_MINUTES } from "./constants";
import { fmtDateTime, won } from "./format";

const { bookings, payments, refunds, schedules, classes, teachers, settlements, users } = schema;
const MIN = 60_000, HOUR = 3_600_000;

// ───────────────────────── 내부 헬퍼 ─────────────────────────

async function lockBooking(tx: Tx, bookingId: string) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for("update");
  if (!b) throw new ApiError(404, "예약을 찾을 수 없습니다.");
  const [s] = await tx.select().from(schedules).where(eq(schedules.id, b.scheduleId));
  const [c] = await tx.select().from(classes).where(eq(classes.id, s.classId));
  const [t] = await tx.select().from(teachers).where(eq(teachers.id, c.teacherId));
  const [p] = await tx.select().from(payments).where(eq(payments.bookingId, b.id)).for("update");
  return { booking: b, schedule: s, cls: c, teacher: t, payment: p as typeof p | undefined };
}

/** 환불 실행 (금액 0이면 아무것도 안 함). 누적 환불액이 결제액을 넘지 않도록 보장 */
async function refund(tx: Tx, payment: typeof payments.$inferSelect | undefined, amount: number, reason: string) {
  if (!payment || payment.status === "READY" || payment.status === "FAILED" || payment.status === "CANCELED") return 0;
  const refundable = payment.amount - payment.refundedAmount;
  const amt = Math.min(amount, refundable);
  if (amt <= 0) return 0;
  const { refundId } = await getPaymentProvider().refund({
    paymentKey: payment.providerPaymentKey!,
    amount: amt,
    reason,
    idempotencyKey: `${payment.id}-${payment.refundedAmount}`,
  });
  await tx.insert(refunds).values({ paymentId: payment.id, amount: amt, reason, providerRefundId: refundId });
  const newRefunded = payment.refundedAmount + amt;
  await tx.update(payments).set({
    refundedAmount: newRefunded,
    status: newRefunded >= payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED",
  }).where(eq(payments.id, payment.id));
  return amt;
}

async function createSettlement(tx: Tx, bookingId: string, teacherId: string, payment: typeof payments.$inferSelect | undefined) {
  if (!payment) return;
  const [fresh] = await tx.select().from(payments).where(eq(payments.id, payment.id));
  const gross = fresh.amount - fresh.refundedAmount;
  const fee = Math.round(gross * env.platformFeeRate);
  await tx.insert(settlements)
    .values({ bookingId, teacherId, grossAmount: gross, feeAmount: fee, netAmount: gross - fee })
    .onConflictDoNothing();
}

async function seatsTaken(tx: Tx, scheduleId: string, excludeBookingId?: string) {
  const holdCutoff = new Date(Date.now() - PAYMENT_HOLD_MINUTES * MIN);
  const [row] = await tx.select({ n: count() }).from(bookings).where(and(
    eq(bookings.scheduleId, scheduleId),
    excludeBookingId ? sql`${bookings.id} <> ${excludeBookingId}` : undefined,
    or(
      inArray(bookings.status, ["REQUESTED", "APPROVED"]),
      and(eq(bookings.status, "PENDING_PAYMENT"), gt(bookings.createdAt, holdCutoff)),
    ),
  ));
  return Number(row.n);
}

const bookingLink = (id: string) => `/bookings#${id}`;

// ───────────────────────── 사용자: 예약 생성 ─────────────────────────

export async function createBooking(userId: string, scheduleId: string) {
  return db.transaction(async (tx) => {
    // 같은 스케줄 동시 예약을 직렬화하기 위해 스케줄 행을 잠근다
    const [s] = await tx.select().from(schedules).where(eq(schedules.id, scheduleId)).for("update");
    if (!s || s.isCanceled) throw new ApiError(404, "예약할 수 없는 일정입니다.");
    const [c] = await tx.select().from(classes).where(eq(classes.id, s.classId));
    const [t] = await tx.select().from(teachers).where(eq(teachers.id, c.teacherId));
    if (!c.isPublished || t.status !== "APPROVED") throw new ApiError(400, "현재 예약을 받지 않는 클래스입니다.");
    if (t.userId === userId) throw new ApiError(400, "본인의 클래스는 예약할 수 없습니다.");
    if (s.startsAt.getTime() - c.bookingCutoffHours * HOUR <= Date.now())
      throw new ApiError(400, "예약 마감 시간이 지났습니다.");

    const holdCutoff = new Date(Date.now() - PAYMENT_HOLD_MINUTES * MIN);
    const [dup] = await tx.select({ id: bookings.id, status: bookings.status }).from(bookings).where(and(
      eq(bookings.userId, userId), eq(bookings.scheduleId, scheduleId),
      or(inArray(bookings.status, ["REQUESTED", "APPROVED"]),
         and(eq(bookings.status, "PENDING_PAYMENT"), gt(bookings.createdAt, holdCutoff))),
    ));
    if (dup) {
      if (dup.status === "PENDING_PAYMENT") {
        // 결제창을 닫았다가 다시 시도하는 경우 — 기존 주문을 그대로 재사용 (중복 주문 방지)
        const [p] = await tx.select().from(payments).where(eq(payments.bookingId, dup.id));
        return { bookingId: dup.id, orderId: p.orderId, amount: p.amount, orderName: c.title };
      }
      throw new ApiError(409, "이미 예약한 일정입니다.");
    }

    if ((await seatsTaken(tx, scheduleId)) >= c.capacity) throw new ApiError(409, "정원이 마감되었습니다.");

    const [b] = await tx.insert(bookings).values({ userId, scheduleId, amount: c.price, status: "PENDING_PAYMENT" }).returning();
    const orderId = `MJ${Date.now()}${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    await tx.insert(payments).values({ bookingId: b.id, orderId, provider: getPaymentProvider().name, amount: c.price });
    return { bookingId: b.id, orderId, amount: c.price, orderName: c.title };
  });
}

// ───────────────────────── 결제 최종 승인 ─────────────────────────

export async function confirmPayment(userId: string, input: { orderId: string; paymentKey: string; amount: number }) {
  const outbox: Notice[] = [];
  const result = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.orderId, input.orderId)).for("update");
    if (!p) throw new ApiError(404, "주문을 찾을 수 없습니다.");
    const { booking, schedule, cls, teacher } = await lockBooking(tx, p.bookingId);
    if (booking.userId !== userId) throw new ApiError(403, "본인의 주문만 결제할 수 있습니다.");

    if (p.status === "PAID") return { bookingId: booking.id, status: booking.status }; // 중복 요청 — 멱등 처리
    if (p.status !== "READY" || booking.status !== "PENDING_PAYMENT")
      throw new ApiError(409, "결제를 진행할 수 없는 주문입니다. 다시 예약해주세요.");
    // ※ 아래 실패 처리들은 throw 대신 값을 반환한다 — 트랜잭션 안에서 throw 하면 실패 기록까지 롤백되기 때문
    if (input.amount !== p.amount) {
      // 결제 금액 위변조 방어
      await tx.update(payments).set({ status: "FAILED", failureReason: "금액 불일치" }).where(eq(payments.id, p.id));
      await tx.update(bookings).set({ status: "EXPIRED" }).where(eq(bookings.id, booking.id));
      return { error: [400, "결제 금액이 일치하지 않습니다."] as const };
    }
    // 결제 대기 시간이 지나 좌석이 풀렸을 수 있으므로 정원 재확인
    if ((await seatsTaken(tx, schedule.id, booking.id)) >= cls.capacity) {
      await tx.update(payments).set({ status: "CANCELED" }).where(eq(payments.id, p.id));
      await tx.update(bookings).set({ status: "EXPIRED" }).where(eq(bookings.id, booking.id));
      return { error: [409, "결제 대기 시간이 지나 정원이 마감되었습니다."] as const };
    }

    const r = await getPaymentProvider().confirm(input);
    if (!r.ok) {
      await tx.update(payments).set({ status: "FAILED", failureReason: r.reason }).where(eq(payments.id, p.id));
      await tx.update(bookings).set({ status: "EXPIRED" }).where(eq(bookings.id, booking.id));
      return { error: [402, r.reason] as const };
    }

    try {
      const now = Date.now();
      const deadline = new Date(Math.max(
        now + 10 * MIN,
        Math.min(now + env.bookingResponseHours * HOUR, schedule.startsAt.getTime() - 30 * MIN),
      ));
      await tx.update(payments).set({ status: "PAID", providerPaymentKey: r.paymentKey, method: r.method, paidAt: r.paidAt })
        .where(eq(payments.id, p.id));
      await tx.update(bookings).set({ status: "REQUESTED", responseDeadline: deadline }).where(eq(bookings.id, booking.id));
      outbox.push({
        userId: teacher.userId, type: "BOOKING_REQUESTED",
        title: "새 예약 요청이 도착했습니다",
        body: `${cls.title} · ${fmtDateTime(schedule.startsAt)} — ${fmtDateTime(deadline)}까지 승인 여부를 결정해주세요.`,
        link: "/teacher",
      });
      outbox.push({
        userId, type: "PAYMENT_PAID", title: "결제가 완료되었습니다",
        body: `${cls.title} ${won(p.amount)} 결제 완료. 지도자 승인 후 예약이 확정됩니다. 거절되면 전액 자동 환불됩니다.`,
        link: bookingLink(booking.id),
      });
      return { bookingId: booking.id, status: "REQUESTED" as const };
    } catch (e) {
      // PG 승인은 됐는데 DB 반영이 실패한 경우 → 즉시 결제 취소하여 "돈만 빠져나간" 상태를 막는다
      await getPaymentProvider().refund({ paymentKey: r.paymentKey, amount: p.amount, reason: "시스템 오류 자동취소", idempotencyKey: `${p.id}-sysfail` })
        .catch((err) => console.error("[CRITICAL] 자동취소 실패 — 수동 환불 필요", p.orderId, err));
      throw e;
    }
  });
  await deliver(outbox);
  if ("error" in result && result.error) throw new ApiError(result.error[0], result.error[1]);
  return result;
}

// ───────────────────────── 지도자: 승인 / 거절 ─────────────────────────

export async function teacherDecide(teacherId: string, bookingId: string, decision: "approve" | "reject", reason = "") {
  const outbox: Notice[] = [];
  const res = await db.transaction(async (tx) => {
    const { booking, schedule, cls, teacher, payment } = await lockBooking(tx, bookingId);
    if (teacher.id !== teacherId) throw new ApiError(403, "본인 클래스의 예약만 처리할 수 있습니다.");
    if (booking.status !== "REQUESTED") throw new ApiError(409, "이미 처리된 예약입니다.");

    if (booking.responseDeadline && booking.responseDeadline.getTime() < Date.now()) {
      await tx.update(bookings).set({ status: "EXPIRED", decidedAt: new Date() }).where(eq(bookings.id, booking.id));
      await refund(tx, payment, booking.amount, "지도자 응답기한 초과");
      outbox.push({ userId: booking.userId, type: "BOOKING_EXPIRED", title: "예약이 자동 취소되었습니다",
        body: `지도자가 기한 내 응답하지 않아 ${won(booking.amount)}이 전액 환불됩니다.`, link: bookingLink(booking.id) });
      return { expired: true };
    }

    if (decision === "approve") {
      await tx.update(bookings).set({ status: "APPROVED", decidedAt: new Date() }).where(eq(bookings.id, booking.id));
      outbox.push({ userId: booking.userId, type: "BOOKING_APPROVED", title: "예약이 확정되었습니다",
        body: `${cls.title} · ${fmtDateTime(schedule.startsAt)}${cls.location ? ` · ${cls.format === "ONLINE" ? "접속 안내" : "장소"}: ${cls.location}` : ""}`,
        link: bookingLink(booking.id) });
      return { status: "APPROVED" };
    }
    await tx.update(bookings).set({ status: "REJECTED", decidedAt: new Date(), cancelReason: reason }).where(eq(bookings.id, booking.id));
    const amt = await refund(tx, payment, booking.amount, "지도자 거절");
    outbox.push({ userId: booking.userId, type: "BOOKING_REJECTED", title: "예약이 성사되지 않았습니다",
      body: `${cls.title} 예약을 지도자가 수락하지 않아 ${won(amt)}이 전액 환불됩니다.${reason ? ` (사유: ${reason})` : ""}`,
      link: bookingLink(booking.id) });
    return { status: "REJECTED" };
  });
  await deliver(outbox);
  if ("expired" in res) throw new ApiError(409, "응답 기한이 지나 자동 취소·환불된 예약입니다.");
  return res;
}

// ───────────────────────── 취소 ─────────────────────────

export async function userCancel(userId: string, bookingId: string, reason = "") {
  const outbox: Notice[] = [];
  const res = await db.transaction(async (tx) => {
    const { booking, schedule, cls, teacher, payment } = await lockBooking(tx, bookingId);
    if (booking.userId !== userId) throw new ApiError(403, "본인의 예약만 취소할 수 있습니다.");
    if (!["PENDING_PAYMENT", "REQUESTED", "APPROVED"].includes(booking.status))
      throw new ApiError(409, "취소할 수 없는 상태의 예약입니다.");
    if (schedule.startsAt.getTime() <= Date.now()) throw new ApiError(409, "이미 시작된 수업은 취소할 수 없습니다.");

    if (booking.status === "PENDING_PAYMENT") {
      await tx.update(bookings).set({ status: "CANCELED_BY_USER", cancelReason: reason }).where(eq(bookings.id, booking.id));
      if (payment) await tx.update(payments).set({ status: "CANCELED" }).where(eq(payments.id, payment.id));
      return { refunded: 0 };
    }
    const amount = userCancelRefund(booking.status, booking.amount, schedule.startsAt);
    await tx.update(bookings).set({ status: "CANCELED_BY_USER", cancelReason: reason }).where(eq(bookings.id, booking.id));
    const refunded = await refund(tx, payment, amount, "사용자 취소");
    // 부분 환불로 남은 금액은 지도자에게 정산 (취소 수수료)
    if (booking.amount - refunded > 0) await createSettlement(tx, booking.id, teacher.id, payment);
    outbox.push({ userId: teacher.userId, type: "BOOKING_CANCELED", title: "수강생이 예약을 취소했습니다",
      body: `${cls.title} · ${fmtDateTime(schedule.startsAt)}`, link: "/teacher" });
    outbox.push({ userId, type: "BOOKING_CANCELED", title: "예약이 취소되었습니다",
      body: refunded > 0 ? `${won(refunded)}이 환불됩니다.` : "환불 정책에 따라 환불 금액이 없습니다.", link: bookingLink(booking.id) });
    return { refunded };
  });
  await deliver(outbox);
  return res;
}

export async function teacherCancel(teacherId: string, bookingId: string, reason: string) {
  const outbox: Notice[] = [];
  await db.transaction(async (tx) => {
    const { booking, schedule, cls, teacher, payment } = await lockBooking(tx, bookingId);
    if (teacher.id !== teacherId) throw new ApiError(403, "본인 클래스의 예약만 처리할 수 있습니다.");
    if (booking.status !== "APPROVED") throw new ApiError(409, "확정된 예약만 취소할 수 있습니다. 승인 대기 중이면 '거절'을 이용하세요.");
    if (schedule.startsAt.getTime() <= Date.now()) throw new ApiError(409, "이미 시작된 수업은 취소할 수 없습니다.");
    await tx.update(bookings).set({ status: "CANCELED_BY_TEACHER", cancelReason: reason }).where(eq(bookings.id, booking.id));
    await refund(tx, payment, booking.amount, "지도자 취소");
    await tx.update(teachers).set({ penaltyCount: sql`${teachers.penaltyCount} + 1` }).where(eq(teachers.id, teacher.id));
    outbox.push({ userId: booking.userId, type: "BOOKING_CANCELED", title: "지도자가 수업을 취소했습니다",
      body: `${cls.title} · ${fmtDateTime(schedule.startsAt)} — ${won(booking.amount)} 전액 환불됩니다. (사유: ${reason})`,
      link: bookingLink(booking.id) });
  });
  await deliver(outbox);
}

// ───────────────────────── 수업 이후 ─────────────────────────

export async function teacherMarkAfterClass(teacherId: string, bookingId: string, result: "COMPLETED" | "NO_SHOW_USER") {
  const outbox: Notice[] = [];
  await db.transaction(async (tx) => {
    const { booking, schedule, cls, teacher, payment } = await lockBooking(tx, bookingId);
    if (teacher.id !== teacherId) throw new ApiError(403, "본인 클래스의 예약만 처리할 수 있습니다.");
    if (booking.status !== "APPROVED") throw new ApiError(409, "확정된 예약만 처리할 수 있습니다.");
    const edge = result === "COMPLETED" ? schedule.endsAt : schedule.startsAt;
    if (edge.getTime() > Date.now())
      throw new ApiError(409, result === "COMPLETED" ? "수업 종료 후 완료 처리할 수 있습니다." : "수업 시작 후 불참 처리할 수 있습니다.");
    await tx.update(bookings).set({ status: result }).where(eq(bookings.id, booking.id));
    await createSettlement(tx, booking.id, teacher.id, payment);
    outbox.push(result === "COMPLETED"
      ? { userId: booking.userId, type: "REVIEW_REQUEST", title: "수업은 어떠셨나요?", body: `${cls.title} 후기를 남겨주세요.`, link: bookingLink(booking.id) }
      : { userId: booking.userId, type: "NO_SHOW", title: "불참 처리되었습니다",
          body: `${cls.title} 수업에 불참 처리되었습니다. 사실과 다르면 예약 내역에서 신고해주세요.`, link: bookingLink(booking.id) });
  });
  await deliver(outbox);
}

/** 운영자: 지도자 노쇼 확인 → 전액 환불 + 페널티 + 미지급 정산 취소 */
export async function adminTeacherNoShow(bookingId: string) {
  const outbox: Notice[] = [];
  await db.transaction(async (tx) => {
    const { booking, cls, teacher, payment } = await lockBooking(tx, bookingId);
    if (!["APPROVED", "COMPLETED", "NO_SHOW_USER"].includes(booking.status))
      throw new ApiError(409, "처리할 수 없는 상태입니다.");
    const [st] = await tx.select().from(settlements).where(eq(settlements.bookingId, booking.id)).for("update");
    if (st?.status === "PAID") throw new ApiError(409, "이미 지급된 정산입니다. 지도자와 별도 회수 절차가 필요합니다.");
    if (st) await tx.delete(settlements).where(eq(settlements.id, st.id));
    await tx.update(bookings).set({ status: "NO_SHOW_TEACHER" }).where(eq(bookings.id, booking.id));
    await refund(tx, payment, booking.amount, "지도자 노쇼");
    await tx.update(teachers).set({ penaltyCount: sql`${teachers.penaltyCount} + 2` }).where(eq(teachers.id, teacher.id));
    outbox.push({ userId: booking.userId, type: "REFUND", title: "지도자 불참이 확인되었습니다",
      body: `${cls.title} 결제 금액 ${won(booking.amount)} 전액 환불됩니다.`, link: bookingLink(booking.id) });
  });
  await deliver(outbox);
}

// ───────────────────────── 주기 작업 (Cron + 조회 시 자동 실행) ─────────────────────────

/** 기한 지난 예약 정리: 결제 미완료 만료 / 지도자 미응답 자동 환불 / 미처리 수업 자동 완료 */
export async function sweepBookings() {
  const now = new Date();
  const stats = { paymentExpired: 0, responseExpired: 0, autoCompleted: 0 };

  const stalePending = await db.select({ id: bookings.id }).from(bookings).where(and(
    eq(bookings.status, "PENDING_PAYMENT"), lt(bookings.createdAt, new Date(now.getTime() - PAYMENT_HOLD_MINUTES * MIN))));
  for (const { id } of stalePending) {
    await db.transaction(async (tx) => {
      const { booking, payment } = await lockBooking(tx, id);
      if (booking.status !== "PENDING_PAYMENT") return;
      await tx.update(bookings).set({ status: "EXPIRED" }).where(eq(bookings.id, id));
      if (payment?.status === "READY") await tx.update(payments).set({ status: "CANCELED" }).where(eq(payments.id, payment.id));
      stats.paymentExpired++;
    });
  }

  const overdue = await db.select({ id: bookings.id }).from(bookings).where(and(
    eq(bookings.status, "REQUESTED"), lt(bookings.responseDeadline, now)));
  for (const { id } of overdue) {
    const outbox: Notice[] = [];
    await db.transaction(async (tx) => {
      const { booking, cls, teacher, payment } = await lockBooking(tx, id);
      if (booking.status !== "REQUESTED") return;
      await tx.update(bookings).set({ status: "EXPIRED", decidedAt: now }).where(eq(bookings.id, id));
      await refund(tx, payment, booking.amount, "지도자 응답기한 초과");
      outbox.push({ userId: booking.userId, type: "BOOKING_EXPIRED", title: "예약이 자동 취소되었습니다",
        body: `${cls.title} — 지도자가 기한 내 응답하지 않아 ${won(booking.amount)}이 전액 환불됩니다.`, link: bookingLink(id) });
      outbox.push({ userId: teacher.userId, type: "BOOKING_EXPIRED", title: "응답하지 않은 예약이 자동 취소되었습니다",
        body: `${cls.title} 예약 요청이 응답 기한을 넘겨 취소·환불되었습니다.`, link: "/teacher" });
      stats.responseExpired++;
    });
    await deliver(outbox);
  }

  const unmarked = await db.select({ id: bookings.id }).from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .where(and(eq(bookings.status, "APPROVED"), lt(schedules.endsAt, new Date(now.getTime() - AUTO_COMPLETE_HOURS * HOUR))));
  for (const { id } of unmarked) {
    await db.transaction(async (tx) => {
      const { booking, teacher, payment } = await lockBooking(tx, id);
      if (booking.status !== "APPROVED") return;
      await tx.update(bookings).set({ status: "COMPLETED" }).where(eq(bookings.id, id));
      await createSettlement(tx, id, teacher.id, payment);
      stats.autoCompleted++;
    });
  }
  return stats;
}

/** 수업 리마인드 (전일 / 1시간 전). dedupeKey 로 중복 발송 방지 */
export async function sendReminders() {
  const now = Date.now();
  const rows = await db.select({
    id: bookings.id, userId: bookings.userId, startsAt: schedules.startsAt, title: classes.title, teacherUserId: teachers.userId,
  }).from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .innerJoin(teachers, eq(classes.teacherId, teachers.id))
    .where(and(eq(bookings.status, "APPROVED"), gt(schedules.startsAt, new Date(now)), lte(schedules.startsAt, new Date(now + 24 * HOUR))));
  const outbox: Notice[] = [];
  for (const r of rows) {
    const within1h = r.startsAt.getTime() - now <= HOUR;
    const key = within1h ? "1h" : "24h";
    const label = within1h ? "1시간 후" : "내일";
    for (const uid of [r.userId, r.teacherUserId]) {
      outbox.push({ userId: uid, type: "REMINDER", title: `${label} 수업이 있습니다`,
        body: `${r.title} · ${fmtDateTime(r.startsAt)}`, link: uid === r.userId ? bookingLink(r.id) : "/teacher",
        dedupeKey: `remind:${key}:${r.id}:${uid}` });
    }
  }
  await deliver(outbox);
  return { reminders: outbox.length };
}

