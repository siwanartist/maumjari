/**
 * 핵심 시나리오 자동 점검 (실제 서버 + 실제 DB 대상)
 *   1) 서버 실행: npm run dev  (또는 npm start, 이때 ALLOW_MOCK_PAYMENT=true)
 *   2) 데모 데이터: npm run db:seed -- --demo
 *   3) npm run test:smoke
 * ⚠️ 테스트 데이터를 만들고 시각을 조작하므로 운영 DB에서 절대 실행하지 말 것
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "../src/db";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
if (process.env.NODE_ENV === "production") throw new Error("운영 환경에서 실행 금지");

let pass = 0, fail = 0;
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, detail ?? ""); }
}

class Client {
  cookie = "";
  async req(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
    const r = await fetch(BASE + path, {
      method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined, redirect: "manual",
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data: data as any };
  }
  login(email: string, password = "demo1234!") { return this.req("/api/auth/login", "POST", { email, password }); }
}

const HOUR = 3_600_000;
async function setScheduleStart(scheduleId: string, startsAt: Date) {
  await db.update(schema.schedules).set({ startsAt, endsAt: new Date(startsAt.getTime() + HOUR) }).where(eq(schema.schedules.id, scheduleId));
}
async function booking(id: string) { return db.query.bookings.findFirst({ where: eq(schema.bookings.id, id) }); }
async function payment(bookingId: string) { return db.query.payments.findFirst({ where: eq(schema.payments.bookingId, bookingId) }); }

async function main() {
  const stamp = Date.now();
  const teacher = new Client(), admin = new Client(), u1 = new Client(), u2 = new Client(), anon = new Client();
  check("지도자 로그인", (await teacher.login("doyun@demo.local")).status === 200);
  check("관리자 로그인", (await admin.login(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)).status === 200);
  check("잘못된 비밀번호 거부", (await anon.login("doyun@demo.local", "wrong")).status === 401);

  console.log("\n[회원가입·온보딩·추천]");
  const prefs = { motives: ["수면 개선"], types: ["바디스캔"], level: "입문", time: "저녁" };
  let r = await u1.req("/api/auth/signup", "POST", { email: `u1_${stamp}@t.local`, password: "password1", name: "테스터1", agreeTerms: true, prefs });
  check("회원가입 + 취향 저장", r.status === 201, r.data);
  r = await u2.req("/api/auth/signup", "POST", { email: `u2_${stamp}@t.local`, password: "password2", name: "테스터2", agreeTerms: true });
  check("회원가입 (취향 없이)", r.status === 201);
  check("약관 미동의 가입 거부", (await anon.req("/api/auth/signup", "POST", { email: `x_${stamp}@t.local`, password: "password1", name: "x", agreeTerms: false })).status === 400);
  check("중복 이메일 거부", (await anon.req("/api/auth/signup", "POST", { email: `u1_${stamp}@t.local`, password: "password1", name: "x", agreeTerms: true })).status === 409);
  r = await u1.req("/api/teachers?sort=reco");
  const top = r.data.teachers.find((t: any) => t.id === r.data.recommendedIds[0]);
  check("취향 반영 추천 (수면/바디스캔 → 이서윤 1순위)", top?.displayName === "이서윤", top?.displayName);
  check("심사 대기 지도자는 목록 미노출", !r.data.teachers.some((t: any) => t.displayName === "강예린"));
  r = await u1.req("/api/teachers?sort=distance&lat=37.4979&lng=127.0276");
  check("거리순 정렬 (강남역 기준 → 김도윤 1순위)", r.data.teachers[0]?.displayName === "김도윤");

  // 테스트 전용 클래스 (정원 1) 생성
  console.log("\n[지도자: 클래스·일정 등록]");
  r = await teacher.req("/api/teacher/classes", "POST", { title: `테스트 클래스 ${stamp}`, format: "OFFLINE", location: "테스트 장소 123", capacity: 1, price: 40000, durationMinutes: 60, bookingCutoffHours: 0 });
  check("클래스 생성", r.status === 201, r.data);
  const classId = r.data.id;
  const future = (days: number) => new Date(Date.now() + days * 24 * HOUR);
  r = await teacher.req(`/api/teacher/classes/${classId}/schedules`, "POST", { mode: "once", startsAt: [1, 2, 3, 4, 5, 6, 7, 8].map((d) => future(d + 5).toISOString()) });
  check("일정 8개 추가", r.data.added === 8, r.data);
  r = await teacher.req(`/api/teacher/classes/${classId}/schedules`, "POST", { mode: "weekly", weekdays: [1, 3], time: "19:30", fromDate: new Date(Date.now() + 40 * 24 * HOUR).toISOString().slice(0, 10), weeks: 2 });
  check("매주 반복 일정 (월·수 × 2주 = 4개)", r.data.added === 4, r.data);
  const sch = (await db.select().from(schema.schedules).where(eq(schema.schedules.classId, classId))).sort((a, b) => +a.startsAt - +b.startsAt);
  const teacherRow = await db.query.teachers.findFirst({ where: eq(schema.teachers.displayName, "김도윤") });

  async function bookAndPay(c: Client, scheduleId: string, key = "mock") {
    const o = await c.req("/api/bookings", "POST", { scheduleId });
    if (o.status !== 201) return { o, p: null };
    const p = await c.req("/api/payments/confirm", "POST", { orderId: o.data.orderId, amount: o.data.amount, paymentKey: `${key}_${o.data.orderId}` });
    return { o, p };
  }

  console.log("\n[예약 → 결제 → 승인 확정]");
  const a = await bookAndPay(u1, sch[0].id);
  check("예약 요청 + 결제 성공 → 승인 대기", a.p?.status === 200 && a.p.data.status === "REQUESTED", a.p?.data);
  check("결제 상태 PAID", (await payment(a.o.data.bookingId))?.status === "PAID");
  r = await u1.req("/api/bookings");
  check("확정 전에는 장소 비공개", r.data.bookings.find((b: any) => b.id === a.o.data.bookingId)?.location === "");
  check("같은 결제 재승인 요청 → 멱등 처리", (await u1.req("/api/payments/confirm", "POST", { orderId: a.o.data.orderId, amount: 40000, paymentKey: `mock_${a.o.data.orderId}` })).status === 200);
  check("같은 일정 중복 예약 거부", (await u1.req("/api/bookings", "POST", { scheduleId: sch[0].id })).status === 409);
  check("정원 초과 예약 거부 (정원 1)", (await u2.req("/api/bookings", "POST", { scheduleId: sch[0].id })).status === 409);
  check("수강생은 승인 불가 (권한)", (await u1.req(`/api/teacher/bookings/${a.o.data.bookingId}`, "POST", { action: "approve" })).status === 403);
  r = await teacher.req(`/api/teacher/bookings/${a.o.data.bookingId}`, "POST", { action: "approve" });
  check("지도자 승인 → 예약 확정", r.data.status === "APPROVED", r.data);
  check("이미 처리된 예약 재승인 거부", (await teacher.req(`/api/teacher/bookings/${a.o.data.bookingId}`, "POST", { action: "reject" })).status === 409);
  r = await u1.req("/api/bookings");
  check("확정 후 장소 공개", r.data.bookings.find((b: any) => b.id === a.o.data.bookingId)?.location === "테스트 장소 123");
  r = await u1.req("/api/notifications");
  check("수강생에게 확정 알림", r.data.notifications.some((n: any) => n.type === "BOOKING_APPROVED"));

  console.log("\n[지도자 거절 → 전액 자동 환불]");
  const b = await bookAndPay(u2, sch[1].id);
  r = await teacher.req(`/api/teacher/bookings/${b.o.data.bookingId}`, "POST", { action: "reject", reason: "해당 시간 불가" });
  const pb = await payment(b.o.data.bookingId);
  check("거절 → REJECTED + 전액 환불", r.data.status === "REJECTED" && pb?.status === "REFUNDED" && pb.refundedAmount === 40000, pb);
  const c2 = await bookAndPay(u1, sch[1].id);
  check("거절로 풀린 좌석 재예약 가능", c2.p?.status === 200);

  console.log("\n[결제 실패 / 금액 위변조]");
  const f = await bookAndPay(u2, sch[2].id, "mock_fail");
  check("카드 승인 실패 → 오류 반환", f.p?.status === 402, f.p?.data);
  check("실패 예약은 만료 처리", (await booking(f.o.data.bookingId))?.status === "EXPIRED");
  const t1 = await u2.req("/api/bookings", "POST", { scheduleId: sch[2].id });
  check("결제 실패 후 좌석 즉시 반환 → 재예약 가능", t1.status === 201, t1.data);
  r = await u2.req("/api/payments/confirm", "POST", { orderId: t1.data.orderId, amount: 100, paymentKey: `mock_${t1.data.orderId}` });
  check("금액 위변조 차단", r.status === 400 && (await payment(t1.data.bookingId))?.status === "FAILED");
  const other = await u2.req("/api/bookings", "POST", { scheduleId: sch[2].id });
  check("타인 주문 결제 불가", (await u1.req("/api/payments/confirm", "POST", { orderId: other.data.orderId, amount: other.data.amount, paymentKey: "mock_x" })).status === 403);
  await u2.req(`/api/bookings/${other.data.bookingId}/cancel`, "POST", {});

  console.log("\n[동시 예약 경쟁 (정원 1, 동시 6명)]");
  const racers = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
    const c = new Client();
    await c.req("/api/auth/signup", "POST", { email: `race${i}_${stamp}@t.local`, password: "password1", name: `race${i}`, agreeTerms: true });
    return c;
  }));
  const results = await Promise.all(racers.map((c) => c.req("/api/bookings", "POST", { scheduleId: sch[3].id })));
  check("동시 요청 중 정확히 1명만 예약 성공", results.filter((x) => x.status === 201).length === 1, results.map((x) => x.status));

  console.log("\n[지도자 미응답 → 기한 초과 자동 환불 (Cron)]");
  const e = await bookAndPay(u1, sch[4].id);
  await db.update(schema.bookings).set({ responseDeadline: new Date(Date.now() - 60_000) }).where(eq(schema.bookings.id, e.o.data.bookingId));
  check("Cron 비밀키 없이 호출 거부", (await anon.req("/api/cron/sweep")).status === 401);
  r = await anon.req("/api/cron/sweep", "GET", undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` });
  check("Cron 실행", r.status === 200 && r.data.responseExpired >= 1, r.data);
  const pe = await payment(e.o.data.bookingId);
  check("미응답 예약 → EXPIRED + 전액 환불", (await booking(e.o.data.bookingId))?.status === "EXPIRED" && pe?.status === "REFUNDED");
  check("기한 지난 뒤 지도자 승인 시도 거부", (await teacher.req(`/api/teacher/bookings/${e.o.data.bookingId}`, "POST", { action: "approve" })).status === 409);

  console.log("\n[사용자 취소 환불율]");
  const g = await bookAndPay(u2, sch[5].id);
  r = await u2.req(`/api/bookings/${g.o.data.bookingId}/cancel`, "POST", { reason: "" });
  check("승인 전 취소 → 100% 환불", r.data.refunded === 40000, r.data);
  const h = await bookAndPay(u2, sch[6].id);
  await teacher.req(`/api/teacher/bookings/${h.o.data.bookingId}`, "POST", { action: "approve" });
  await setScheduleStart(sch[6].id, new Date(Date.now() + 30 * HOUR));
  r = await u2.req(`/api/bookings/${h.o.data.bookingId}/cancel`, "POST", { reason: "일정 변경" });
  check("확정 후 수업 30시간 전 취소 → 50% 환불", r.data.refunded === 20000, r.data);
  const sh = await db.query.settlements.findFirst({ where: eq(schema.settlements.bookingId, h.o.data.bookingId) });
  check("남은 50%는 지도자 정산 (수수료 15% 차감)", sh?.grossAmount === 20000 && sh.netAmount === 17000, sh);
  const i = await bookAndPay(u2, sch[7].id);
  await teacher.req(`/api/teacher/bookings/${i.o.data.bookingId}`, "POST", { action: "approve" });
  await setScheduleStart(sch[7].id, new Date(Date.now() + 5 * HOUR));
  r = await u2.req(`/api/bookings/${i.o.data.bookingId}/cancel`, "POST", {});
  check("수업 5시간 전 취소 → 환불 없음", r.data.refunded === 0, r.data);

  console.log("\n[지도자 취소 → 전액 환불 + 페널티]");
  const penaltyBefore = teacherRow!.penaltyCount;
  r = await teacher.req(`/api/teacher/bookings/${c2.o.data.bookingId}`, "POST", { action: "approve" });
  r = await teacher.req(`/api/teacher/bookings/${c2.o.data.bookingId}`, "POST", { action: "cancel", reason: "개인 사정" });
  const t2 = await db.query.teachers.findFirst({ where: eq(schema.teachers.id, teacherRow!.id) });
  check("지도자 취소 → 전액 환불 + 페널티 +1", (await payment(c2.o.data.bookingId))?.status === "REFUNDED" && t2!.penaltyCount === penaltyBefore + 1);

  console.log("\n[수업 완료 → 정산 → 후기]");
  check("수업 전 완료 처리 거부", (await teacher.req(`/api/teacher/bookings/${a.o.data.bookingId}`, "POST", { action: "complete" })).status === 409);
  await setScheduleStart(sch[0].id, new Date(Date.now() - 3 * HOUR));
  r = await teacher.req(`/api/teacher/bookings/${a.o.data.bookingId}`, "POST", { action: "complete" });
  const sa = await db.query.settlements.findFirst({ where: eq(schema.settlements.bookingId, a.o.data.bookingId) });
  check("완료 → 정산 생성 (40,000 - 6,000 = 34,000)", sa?.netAmount === 34000, sa);
  check("완료 전 후기 불가 (다른 예약)", (await u2.req("/api/reviews", "POST", { bookingId: h.o.data.bookingId, rating: 5, body: "좋았어요 정말" })).status === 400);
  const before = await db.query.teachers.findFirst({ where: eq(schema.teachers.id, teacherRow!.id) });
  r = await u1.req("/api/reviews", "POST", { bookingId: a.o.data.bookingId, rating: 3, body: "괜찮았습니다." });
  const after = await db.query.teachers.findFirst({ where: eq(schema.teachers.id, teacherRow!.id) });
  check("후기 작성 + 평점 재계산", r.status === 201 && after!.ratingCount === before!.ratingCount + 1 && after!.ratingAvg < before!.ratingAvg);
  check("후기 중복 작성 거부", (await u1.req("/api/reviews", "POST", { bookingId: a.o.data.bookingId, rating: 5, body: "두번째 후기" })).status === 409);

  console.log("\n[신고 → 운영자 지도자 노쇼 확정 → 환불]");
  r = await u1.req("/api/reports", "POST", { targetType: "BOOKING", targetId: a.o.data.bookingId, reason: "지도자가 오지 않았습니다." });
  check("신고 접수", r.status === 201);
  check("일반 회원은 운영자 API 불가", (await u1.req("/api/admin/reports")).status === 403);
  r = await admin.req("/api/admin/reports");
  const rep = r.data.reports.find((x: any) => x.targetId === a.o.data.bookingId);
  r = await admin.req(`/api/admin/reports/${rep.id}`, "POST", { action: "resolve", confirmTeacherNoShow: true, note: "확인됨" });
  check("노쇼 확정 → 전액 환불 + 정산 취소", r.status === 200 && (await payment(a.o.data.bookingId))?.status === "REFUNDED" &&
    !(await db.query.settlements.findFirst({ where: eq(schema.settlements.bookingId, a.o.data.bookingId) })), r.data);

  console.log("\n[메시지]");
  r = await u2.req("/api/threads", "POST", { teacherId: teacherRow!.id });
  const th = r.data.id;
  await u2.req(`/api/threads/${th}/messages`, "POST", { body: "안녕하세요, 문의드려요" });
  r = await teacher.req(`/api/threads/${th}/messages`);
  check("지도자가 메시지 수신", r.data.messages?.some((m: any) => m.body.includes("문의")));
  check("제3자 대화 열람 차단", (await u1.req(`/api/threads/${th}/messages`)).status === 403);

  console.log("\n[지도자 등록 → 운영자 승인]");
  r = await u2.req("/api/teacher/apply", "POST", { displayName: "테스트지도자", bio: "스무 글자 이상의 소개글을 작성합니다. 잘 부탁드립니다.", tags: ["호흡명상"] });
  check("지도자 등록 신청", r.status === 201, r.data);
  const newT = await db.query.teachers.findFirst({ where: eq(schema.teachers.displayName, "테스트지도자") });
  check("승인 전 예약 처리 불가", (await u2.req(`/api/teacher/bookings/${a.o.data.bookingId}`, "POST", { action: "approve" })).status === 403);
  r = await admin.req(`/api/admin/teachers/${newT!.id}`, "POST", { action: "approve" });
  check("운영자 승인 → 목록 노출", (await anon.req("/api/teachers")).data.teachers.some((t: any) => t.id === newT!.id));

  console.log(`\n결과: ${pass}개 통과 / ${fail}개 실패`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
