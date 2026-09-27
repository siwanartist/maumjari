import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createBooking, sweepBookings } from "@/lib/booking";
import { getPaymentProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";
const { bookings, schedules, classes, teachers, payments, reviews } = schema;

/** 예약 생성 → 주문 생성. 응답의 checkout 으로 브라우저가 결제창을 띄운다 */
export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const { scheduleId } = await parseBody(req, z.object({ scheduleId: z.string().min(1) }));
  const order = await createBooking(u.id, scheduleId);
  const checkout = getPaymentProvider().checkoutParams({
    orderId: order.orderId, amount: order.amount, orderName: order.orderName,
    customerEmail: u.email, customerName: u.name,
  });
  return ok({ bookingId: order.bookingId, orderId: order.orderId, amount: order.amount, checkout }, 201);
});

/** 내 예약 내역 */
export const GET = handler(async () => {
  const u = await requireUser();
  await sweepBookings(); // 기한 지난 예약을 즉시 반영 (Cron 주기와 무관하게 정확한 상태 표시)
  const rows = await db.select({
    id: bookings.id, status: bookings.status, amount: bookings.amount, createdAt: bookings.createdAt,
    responseDeadline: bookings.responseDeadline, cancelReason: bookings.cancelReason,
    startsAt: schedules.startsAt, endsAt: schedules.endsAt,
    classTitle: classes.title, format: classes.format, location: classes.location,
    teacherId: teachers.id, teacherName: teachers.displayName,
    paymentStatus: payments.status, refundedAmount: payments.refundedAmount, orderId: payments.orderId,
  }).from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .innerJoin(teachers, eq(classes.teacherId, teachers.id))
    .leftJoin(payments, eq(payments.bookingId, bookings.id))
    .where(eq(bookings.userId, u.id))
    .orderBy(desc(bookings.createdAt));

  const reviewed = rows.length
    ? new Set((await db.select({ b: reviews.bookingId }).from(reviews)
        .where(inArray(reviews.bookingId, rows.map((r) => r.id)))).map((r) => r.b))
    : new Set<string>();

  return ok({
    bookings: rows
      .filter((r) => !(r.status === "EXPIRED" && r.paymentStatus === "CANCELED")) // 결제 안 하고 닫은 주문은 숨김
      .map((r) => ({
        ...r,
        // 장소·접속 정보는 확정된 예약에만 공개
        location: r.status === "APPROVED" || r.status === "COMPLETED" ? r.location : "",
        canReview: r.status === "COMPLETED" && !reviewed.has(r.id),
      })),
  });
});
