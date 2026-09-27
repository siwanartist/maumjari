/**
 * 100명 시뮬레이션 (수강생 50 + 지도자 50) — 실제 서버 + 실제 DB 대상
 *   1) 서버 실행: ALLOW_MOCK_PAYMENT=true npm start  (또는 npm run dev)
 *   2) npm run test:simulate
 *
 * 가입·로그인·지도자 심사·클래스 개설·예약·결제·승인/거절·취소·환불·완료·정산·후기·신고·메시지를
 * 무작위로 섞어 실행한 뒤, DB 전체를 훑어 돈·좌석·평점·정산이 규칙과 어긋난 곳이 없는지 검증한다.
 * ⚠️ 운영 DB에서 절대 실행하지 말 것 (테스트 데이터 대량 생성 + 시각 조작)
 */
import "dotenv/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool, schema } from "../src/db";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
if (process.env.NODE_ENV === "production") throw new Error("운영 환경에서 실행 금지");
const N_STUDENTS = Number(process.env.SIM_STUDENTS ?? 50), N_TEACHERS = Number(process.env.SIM_TEACHERS ?? 50);
const HOUR = 3_600_000, DAY = 24 * HOUR;
const FEE = Number(process.env.PLATFORM_FEE_RATE ?? "0.15");

// 결정적 난수 (재현 가능)
let seed = Number(process.env.SIM_SEED ?? 20260927);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) pass++;
  else { fail++; failures.push(name); console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ""); }
}
function section(t: string) { console.log(`\n[${t}]`); }

class Client {
  cookie = "";
  constructor(public email: string, public name: string, public password = "simpass1!") {}
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
  login(pw = this.password) { return this.req("/api/auth/login", "POST", { email: this.email, password: pw }); }
}
async function batch<T, R>(items: T[], size: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map((x, j) => fn(x, i + j))));
  return out;
}

const MOTIVES = ["스트레스/불안 완화", "수면 개선", "집중력 향상", "영적 성장", "단순 호기심"];
const TYPES = ["마음챙김", "호흡명상", "바디스캔", "걷기명상", "소리명상"];
const LEVELS = ["입문", "중급", "숙련"], TIMES = ["아침", "점심", "저녁", "주말"];
const REGIONS = [["강남구", 37.4979, 127.0276], ["마포구", 37.5663, 126.9019], ["서초구", 37.4837, 127.0324], ["성동구", 37.5634, 127.0369], ["온라인", null, null]] as const;
const SURNAME = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"], GIVEN = ["서윤", "도현", "하늘", "은비", "마루", "지우", "민준", "수아", "예린", "시우"];
const REVIEW_TEXT = ["정말 편안한 시간이었어요.", "설명이 차분하고 좋았습니다.", "기대보다 평범했어요.", "다음에도 신청할게요!", "집중이 잘 됐습니다.", "조금 아쉬웠지만 괜찮았어요."];

type Sched = { id: string; classId: string; teacherIdx: number; capacity: number; price: number; startsAt: Date };
type BookingRec = { id: string; orderId: string; amount: number; studentIdx: number; teacherIdx: number; scheduleId: string; expect: string };

async function main() {
  const stamp = Date.now().toString(36);
  const admin = new Client(process.env.ADMIN_EMAIL!, "운영자", process.env.ADMIN_PASSWORD!);
  check("관리자 로그인", (await admin.login()).status === 200);

  // ───────── 1. 가입 · 로그인 ─────────
  section("1. 회원가입 · 로그인 (100명)");
  const students = Array.from({ length: N_STUDENTS }, (_, i) => new Client(`s${i}_${stamp}@sim.local`, `${pick(SURNAME)}${pick(GIVEN)}`));
  const teachers = Array.from({ length: N_TEACHERS }, (_, i) => new Client(`t${i}_${stamp}@sim.local`, `${pick(SURNAME)}${pick(GIVEN)}`));
  const signups = await batch([...students, ...teachers], 10, async (c, i) => {
    const prefs = i < N_STUDENTS ? { motives: [pick(MOTIVES)], types: [pick(TYPES), pick(TYPES)], level: pick(LEVELS), time: pick(TIMES) } : undefined;
    return c.req("/api/auth/signup", "POST", { email: c.email, password: c.password, name: c.name, agreeTerms: true, prefs });
  });
  check("100명 가입 성공", signups.every((r) => r.status === 201), signups.filter((r) => r.status !== 201).map((r) => r.data));
  const relog = await batch(students, 10, (c) => { c.cookie = ""; return c.login(); });
  check("가입 후 재로그인 50명 성공", relog.every((r) => r.status === 200));
  check("잘못된 비밀번호 거부", (await new Client(students[0].email, "x").login("wrong-pw")).status === 401);
  check("대소문자 다른 이메일도 로그인", (await new Client(students[1].email.toUpperCase(), "x", "simpass1!").login()).status === 200);
  check("없는 계정 로그인 거부", (await new Client(`nobody_${stamp}@sim.local`, "x").login()).status === 401);
  check("로그인 전 예약 API 401", (await new Client("a@b.c", "x").req("/api/bookings")).status === 401);
  const me = await students[0].req("/api/me");
  check("/api/me 취향 저장 확인", me.data.preference?.motives?.length === 1);

  // ───────── 2. 지도자 신청 · 심사 ─────────
  section("2. 지도자 신청 → 운영자 심사 (50명)");
  const applies = await batch(teachers, 10, (c, i) => {
    const [region, lat, lng] = REGIONS[i % REGIONS.length];
    return c.req("/api/teacher/apply", "POST", {
      displayName: `${c.name}${i}`, tagline: `${pick(TYPES)}으로 여는 하루`, region, latitude: lat, longitude: lng,
      bio: `시뮬레이션 지도자 ${i}입니다. 스무 글자 이상의 소개글을 여기에 적습니다. 잘 부탁드립니다.`,
      certification: chance(0.6) ? "명상 지도자 과정 수료" : "", certProofUrl: chance(0.6) ? "https://example.com/cert" : "",
      tags: [pick(MOTIVES), pick(TYPES), pick(LEVELS), pick(TIMES)],
    });
  });
  check("50명 지도자 신청 접수", applies.every((r) => r.status === 201), applies.filter((r) => r.status !== 201).map((r) => r.data));
  check("중복 신청 거부", (await teachers[0].req("/api/teacher/apply", "POST", { displayName: "x", bio: "스무 글자 이상의 소개글을 여기에 적습니다 네네", tags: ["a"] })).status === 409);
  check("승인 전 클래스 개설 가능(심사 중에도 준비 허용)", (await teachers[0].req("/api/teacher/classes", "POST", { title: "준비 클래스", format: "ONLINE", capacity: 3, price: 20000, durationMinutes: 30 })).status === 201);
  check("승인 전 예약 처리는 403", (await teachers[0].req(`/api/teacher/bookings/none`, "POST", { action: "approve" })).status === 403);

  const tRows = await db.select({ id: schema.teachers.id, userId: schema.teachers.userId }).from(schema.teachers)
    .where(inArray(schema.teachers.userId, (await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, teachers.map((t) => t.email)))).map((u) => u.id)));
  const teacherIdByEmail = new Map<string, string>();
  const userRows = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(inArray(schema.users.email, teachers.map((t) => t.email)));
  for (const u of userRows) { const t = tRows.find((x) => x.userId === u.id)!; teacherIdByEmail.set(u.email, t.id); }
  const teacherId = (i: number) => teacherIdByEmail.get(teachers[i].email)!;

  // 45명 승인, 3명 반려, 2명 심사 대기. 승인자 중 절반 인증 배지
  const rejectedIdx = [47, 48, 49], pendingIdx = [45, 46];
  const decisions = await batch(teachers.map((_, i) => i), 10, async (i) => {
    if (pendingIdx.includes(i)) return { status: 200 };
    if (rejectedIdx.includes(i)) return admin.req(`/api/admin/teachers/${teacherId(i)}`, "POST", { action: "reject", reason: "증빙 부족" });
    const r = await admin.req(`/api/admin/teachers/${teacherId(i)}`, "POST", { action: "approve" });
    if (i % 2 === 0) await admin.req(`/api/admin/teachers/${teacherId(i)}`, "POST", { action: "verify" });
    return r;
  });
  check("심사 처리 API 모두 성공", decisions.every((r) => r.status === 200));
  check("사유 없는 반려 거부", (await admin.req(`/api/admin/teachers/${teacherId(45)}`, "POST", { action: "reject" })).status === 400);
  check("일반 회원의 심사 API 403", (await students[0].req(`/api/admin/teachers/${teacherId(45)}`, "POST", { action: "approve" })).status === 403);
  const rejMe = await teachers[47].req("/api/me");
  check("반려 지도자에게 사유 전달", rejMe.data.teacher?.status === "REJECTED" && rejMe.data.teacher.rejectReason === "증빙 부족", rejMe.data.teacher);
  const reapply = await teachers[47].req("/api/teacher/profile", "PATCH", { displayName: "재신청", bio: "증빙을 보완해서 다시 신청하는 소개글입니다. 스무 자 이상.", certProofUrl: "https://example.com/proof", tags: ["호흡명상"] });
  check("반려 후 프로필 수정 → 재심사 대기", reapply.data.status === "PENDING", reapply.data);
  const notiT = await teachers[0].req("/api/notifications");
  check("승인 알림 도착", notiT.data.notifications.some((n: any) => n.type === "TEACHER_STATUS"));
  const list0 = await students[0].req("/api/teachers");
  check("승인 지도자만 목록에 노출 (반려·대기 제외)", !list0.data.teachers.some((t: any) => [45, 46, 47, 48, 49].some((i) => t.id === teacherId(i))));

  // ───────── 3. 클래스 · 일정 ─────────
  section("3. 클래스 · 일정 개설");
  const approved = teachers.map((_, i) => i).filter((i) => i < 45);
  const scheds: Sched[] = [];
  const classRes = await batch(approved, 8, async (i) => {
    const t = teachers[i];
    const nClass = 1 + (i % 2);
    for (let k = 0; k < nClass; k++) {
      const format = pick(["OFFLINE", "ONLINE"] as const);
      const capacity = pick([1, 2, 3, 4, 6, 10]), price = pick([15000, 25000, 30000, 40000, 50000, 70000]);
      const r = await t.req("/api/teacher/classes", "POST", {
        title: `${t.name}의 ${pick(TYPES)} 클래스 ${k + 1}`, description: "시뮬레이션 클래스", format,
        location: format === "ONLINE" ? "확정 후 링크 안내" : "서울 어딘가 3층", capacity, price, durationMinutes: pick([30, 45, 60]), bookingCutoffHours: pick([0, 3, 24]),
      });
      if (r.status !== 201) return r;
      const starts = Array.from({ length: 4 }, (_, j) => new Date(Date.now() + (3 + j * 3 + (i % 3)) * DAY + (10 + (i % 8)) * HOUR).toISOString());
      const s = await t.req(`/api/teacher/classes/${r.data.id}/schedules`, "POST", { mode: "once", startsAt: starts });
      if (s.status !== 201) return s;
      const rows = await db.select().from(schema.schedules).where(eq(schema.schedules.classId, r.data.id));
      for (const row of rows) scheds.push({ id: row.id, classId: row.classId, teacherIdx: i, capacity, price, startsAt: row.startsAt });
    }
    return { status: 201 };
  });
  check("승인 지도자 45명 클래스·일정 개설", classRes.every((r) => r.status === 201), classRes.filter((r) => r.status !== 201));
  console.log(`  · 일정 ${scheds.length}개, 총 좌석 ${scheds.reduce((a, s) => a + s.capacity, 0)}석`);
  const cls0 = scheds.find((s) => s.teacherIdx === 0)!.classId;
  check("과거 일정 추가 거부", (await teachers[0].req(`/api/teacher/classes/${cls0}/schedules`, "POST", { mode: "once", startsAt: [new Date(Date.now() - DAY).toISOString()] })).status === 400);
  check("타 지도자 클래스에 일정 추가 불가", (await teachers[1].req(`/api/teacher/classes/${cls0}/schedules`, "POST", { mode: "once", startsAt: [new Date(Date.now() + 5 * DAY).toISOString()] })).status === 404);
  check("가격 1,000원 미만 클래스 거부", (await teachers[0].req("/api/teacher/classes", "POST", { title: "싼 클래스", format: "ONLINE", capacity: 1, price: 500, durationMinutes: 30 })).status === 400);
  const detail0 = await students[0].req(`/api/teachers/${teacherId(0)}`);
  check("지도자 상세: 확정 전 장소 비공개", detail0.status === 200 && !JSON.stringify(detail0.data.classes).includes("3층"), detail0.status);
  const listAll = await students[0].req("/api/teachers?sort=reco");
  check("추천 ID는 모두 예약 가능한(가격 있는) 지도자", listAll.data.recommendedIds.every((id: string) => listAll.data.teachers.find((t: any) => t.id === id)?.minPrice != null));
  const byRating = await students[0].req("/api/teachers?sort=price");
  check("가격순 정렬 단조 증가", byRating.data.teachers.every((t: any, i: number, a: any[]) => i === 0 || (a[i - 1].minPrice ?? 1e12) <= (t.minPrice ?? 1e12)));
  const byDist = await students[0].req("/api/teachers?sort=distance&lat=37.4979&lng=127.0276");
  check("거리순 정렬 단조 증가", byDist.data.teachers.every((t: any, i: number, a: any[]) => i === 0 || (a[i - 1].distanceKm ?? 1e9) <= (t.distanceKm ?? 1e9)));

  // ───────── 4. 예약 · 결제 (동시성 포함) ─────────
  section("4. 예약 · 결제 (수강생 50명, 각 2~4건, 10명씩 동시 요청)");
  const book: BookingRec[] = [];
  let failedPay = 0, tampered = 0, soldOut = 0, cutoffBlocked = 0, dupBlocked = 0;
  async function bookAndPay(sIdx: number, s: Sched, mode: "ok" | "fail" | "tamper" | "leave") {
    const c = students[sIdx];
    const o = await c.req("/api/bookings", "POST", { scheduleId: s.id });
    if (o.status === 409) { if (o.data.error.includes("정원")) soldOut++; else dupBlocked++; return; }
    if (o.status === 400) { if (o.data.error.includes("마감")) cutoffBlocked++; return; }
    if (o.status !== 201) { check(`예약 생성 예외 응답 ${o.status}`, false, o.data); return; }
    if (book.some((b) => b.id === o.data.bookingId)) { dupBlocked++; return; } // 결제 대기 중 재요청 → 같은 주문 재사용 (정상)
    const rec: BookingRec = { id: o.data.bookingId, orderId: o.data.orderId, amount: o.data.amount, studentIdx: sIdx, teacherIdx: s.teacherIdx, scheduleId: s.id, expect: "" };
    check("주문 금액 = 클래스 가격", o.data.amount === s.price, [o.data.amount, s.price]);
    if (mode === "leave") { rec.expect = "PENDING_PAYMENT"; book.push(rec); return; }
    const amount = mode === "tamper" ? o.data.amount - 1000 : o.data.amount;
    const p = await c.req("/api/payments/confirm", "POST", { orderId: o.data.orderId, amount, paymentKey: `${mode === "fail" ? "mock_fail" : "mock"}_${o.data.orderId}` });
    if (mode === "fail") { failedPay++; check("카드 실패 → 402", p.status === 402, p); rec.expect = "EXPIRED_FAILED"; }
    else if (mode === "tamper") { tampered++; check("금액 위변조 → 400", p.status === 400, p); rec.expect = "EXPIRED_FAILED"; }
    else { check("결제 승인 → REQUESTED", p.status === 200 && p.data.status === "REQUESTED", p); rec.expect = "REQUESTED"; }
    book.push(rec);
  }
  const jobs: { sIdx: number; s: Sched; mode: "ok" | "fail" | "tamper" | "leave" }[] = [];
  for (let sIdx = 0; sIdx < N_STUDENTS; sIdx++) {
    const n = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) jobs.push({ sIdx, s: pick(scheds), mode: chance(0.05) ? "fail" : chance(0.03) ? "tamper" : chance(0.04) ? "leave" : "ok" });
  }
  // 인기 일정에 몰리는 상황: 정원 1~2짜리 일정 하나에 12명이 동시에
  const hot = scheds.find((s) => s.capacity === 1) ?? scheds[0];
  for (let k = 0; k < 12; k++) jobs.push({ sIdx: (k * 7) % N_STUDENTS, s: hot, mode: "ok" });
  await batch(jobs, 10, (j) => bookAndPay(j.sIdx, j.s, j.mode));
  // 같은 사람이 같은 일정을 동시에 두 번 요청하면 서버가 같은 주문을 돌려준다 → 기록은 한 번만
  for (let i = book.length - 1; i > 0; i--) if (book.findIndex((b) => b.id === book[i].id) !== i) { dupBlocked++; book.splice(i, 1); }
  console.log(`  · 결제 성공 ${book.filter((b) => b.expect === "REQUESTED").length}건 / 카드실패 ${failedPay} / 위변조차단 ${tampered} / 정원마감 ${soldOut} / 중복차단 ${dupBlocked} / 마감시간 ${cutoffBlocked} / 결제창 이탈 ${book.filter((b) => b.expect === "PENDING_PAYMENT").length}`);
  const hotHolders = await db.select({ n: sql<number>`count(*)` }).from(schema.bookings).where(and(eq(schema.bookings.scheduleId, hot.id), inArray(schema.bookings.status, ["REQUESTED", "APPROVED", "PENDING_PAYMENT"])));
  check(`인기 일정(정원 ${hot.capacity}) 동시 12명 → 좌석 초과 없음`, Number(hotHolders[0].n) <= hot.capacity, hotHolders[0].n);
  check("본인 클래스 예약 불가", (await teachers[0].req("/api/bookings", "POST", { scheduleId: scheds.find((s) => s.teacherIdx === 0)!.id })).status === 400);
  // 결제창 이탈 → 다시 시도하면 같은 주문 재사용
  const left = book.find((b) => b.expect === "PENDING_PAYMENT");
  if (left) {
    const again = await students[left.studentIdx].req("/api/bookings", "POST", { scheduleId: left.scheduleId });
    check("결제창 닫고 재시도 → 같은 주문 재사용", again.status === 201 && again.data.orderId === left.orderId, again.data);
  }

  // 결제 대기 좌석 만료 시나리오: 15분 지난 PENDING 은 좌석을 풀어야 하고, 그 뒤 결제 시도는 정원 재확인
  section("5. 결제 대기 만료 · 지연 결제 경쟁");
  const cap1 = scheds.filter((s) => s.capacity === 1 && !book.some((b) => b.scheduleId === s.id && b.expect === "REQUESTED"));
  const race = cap1[0];
  if (race) {
    const a = students[10], b = students[11];
    const oa = await a.req("/api/bookings", "POST", { scheduleId: race.id });
    await db.update(schema.bookings).set({ createdAt: new Date(Date.now() - 20 * 60_000) }).where(eq(schema.bookings.id, oa.data.bookingId));
    const ob = await b.req("/api/bookings", "POST", { scheduleId: race.id });
    check("결제 대기 15분 경과 좌석은 다른 사람이 예약 가능", ob.status === 201, ob.data);
    await db.update(schema.bookings).set({ createdAt: new Date(Date.now() - 20 * 60_000) }).where(eq(schema.bookings.id, ob.data.bookingId));
    // 둘 다 오래된 대기 상태에서 동시에 결제 승인 → 1명만 성공해야 함
    const [pa, pb] = await Promise.all([
      a.req("/api/payments/confirm", "POST", { orderId: oa.data.orderId, amount: oa.data.amount, paymentKey: `mock_${oa.data.orderId}` }),
      b.req("/api/payments/confirm", "POST", { orderId: ob.data.orderId, amount: ob.data.amount, paymentKey: `mock_${ob.data.orderId}` }),
    ]);
    const okN = [pa, pb].filter((p) => p.status === 200).length;
    check("지연된 두 결제가 동시에 들어와도 정원 1 → 1명만 승인", okN === 1, [pa.status, pa.data, pb.status, pb.data]);
    for (const [o, p] of [[oa, pa], [ob, pb]] as const) if (p.status === 200) book.push({ id: o.data.bookingId, orderId: o.data.orderId, amount: o.data.amount, studentIdx: o === oa ? 10 : 11, teacherIdx: race.teacherIdx, scheduleId: race.id, expect: "REQUESTED" });
  }
  // 결제창을 닫고 15분이 지난 주문들 → Cron 이 만료시키고 좌석을 돌려줘야 함
  const leftIds = book.filter((b) => b.expect === "PENDING_PAYMENT").map((b) => b.id);
  if (leftIds.length) await db.update(schema.bookings).set({ createdAt: new Date(Date.now() - 20 * 60_000) }).where(inArray(schema.bookings.id, leftIds));
  const sweep1 = await admin.req("/api/cron/sweep", "GET", undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` });
  check(`Cron: 결제 미완료 주문 ${leftIds.length}건 만료 처리`, sweep1.status === 200 && sweep1.data.paymentExpired >= leftIds.length, sweep1.data);
  if (leftIds.length) {
    const lb = book.find((b) => b.id === leftIds[0])!;
    const again = await students[lb.studentIdx].req("/api/bookings", "POST", { scheduleId: lb.scheduleId });
    check("만료된 주문은 재사용하지 않고 새 주문 발급", again.status === 201 ? again.data.orderId !== lb.orderId : again.status === 409, again.data);
    if (again.status === 201) await students[lb.studentIdx].req(`/api/bookings/${again.data.bookingId}/cancel`, "POST", {});
  }

  // ───────── 6. 지도자 응답 ─────────
  section("6. 지도자 승인 / 거절 / 미응답");
  const requested = book.filter((b) => b.expect === "REQUESTED");
  let approvedN = 0, rejectedN = 0, ignoredN = 0;
  await batch(requested, 10, async (b) => {
    const t = teachers[b.teacherIdx];
    const roll = rnd();
    if (roll < 0.12) { b.expect = "IGNORED"; ignoredN++; return; }
    const action = roll < 0.27 ? "reject" : "approve";
    const r = await t.req(`/api/teacher/bookings/${b.id}`, "POST", { action, reason: action === "reject" ? "그 시간엔 어렵습니다" : "" });
    check(`지도자 ${action} 성공`, r.status === 200, r.data);
    if (action === "approve") { b.expect = "APPROVED"; approvedN++; } else { b.expect = "REJECTED"; rejectedN++; }
  });
  console.log(`  · 승인 ${approvedN} / 거절 ${rejectedN} / 미응답 ${ignoredN}`);
  const someApproved = requested.find((b) => b.expect === "APPROVED")!;
  check("다른 지도자가 남의 예약 승인 불가", (await teachers[(someApproved.teacherIdx + 1) % 45].req(`/api/teacher/bookings/${someApproved.id}`, "POST", { action: "approve" })).status === 403);
  const sb = await students[someApproved.studentIdx].req("/api/bookings");
  check("확정된 예약에 장소 공개", sb.data.bookings.find((x: any) => x.id === someApproved.id)?.location !== "");
  // 미응답 → 기한 초과 → Cron 환불
  const ignored = requested.filter((b) => b.expect === "IGNORED");
  if (ignored.length) await db.update(schema.bookings).set({ responseDeadline: new Date(Date.now() - 60_000) }).where(inArray(schema.bookings.id, ignored.map((b) => b.id)));
  const sweep2 = await admin.req("/api/cron/sweep", "GET", undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` });
  check(`미응답 ${ignored.length}건 자동 환불`, sweep2.data.responseExpired === ignored.length, sweep2.data);
  for (const b of ignored) b.expect = "EXPIRED";
  const tnoti = await teachers[ignored[0]?.teacherIdx ?? 0].req("/api/notifications");
  check("미응답 지도자에게도 알림", !ignored.length || tnoti.data.notifications.some((n: any) => n.type === "BOOKING_EXPIRED"));

  // ───────── 7. 취소 ─────────
  section("7. 취소 (수강생 3단계 환불율 · 지도자 취소 페널티)");
  const approvedList = requested.filter((b) => b.expect === "APPROVED");
  const cancelA = approvedList.slice(0, 4), cancelB = approvedList.slice(4, 8), cancelC = approvedList.slice(8, 11), tCancel = approvedList.slice(11, 14);
  for (const b of cancelA) { // 3일 이상 전 → 100%
    const r = await students[b.studentIdx].req(`/api/bookings/${b.id}/cancel`, "POST", { reason: "일정 변경" });
    check("확정 후 3일+ 전 취소 → 전액 환불", r.data.refunded === b.amount, r.data); b.expect = "CANCELED_100";
  }
  for (const b of cancelB) { // 24~72h → 50%
    await db.update(schema.schedules).set({ startsAt: new Date(Date.now() + 40 * HOUR), endsAt: new Date(Date.now() + 41 * HOUR) }).where(eq(schema.schedules.id, b.scheduleId));
    const r = await students[b.studentIdx].req(`/api/bookings/${b.id}/cancel`, "POST", { reason: "" });
    check("확정 후 40시간 전 취소 → 50% 환불", r.data.refunded === Math.floor(b.amount / 2), r.data); b.expect = "CANCELED_50";
  }
  for (const b of cancelC) { // <24h → 0%
    await db.update(schema.schedules).set({ startsAt: new Date(Date.now() + 6 * HOUR), endsAt: new Date(Date.now() + 7 * HOUR) }).where(eq(schema.schedules.id, b.scheduleId));
    const r = await students[b.studentIdx].req(`/api/bookings/${b.id}/cancel`, "POST", { reason: "" });
    check("확정 후 6시간 전 취소 → 환불 0", r.data.refunded === 0, r.data); b.expect = "CANCELED_0";
  }
  for (const b of tCancel) {
    const r = await teachers[b.teacherIdx].req(`/api/teacher/bookings/${b.id}`, "POST", { action: "cancel", reason: "개인 사정" });
    check("지도자 확정 취소 → 200", r.status === 200, r.data); b.expect = "CANCELED_BY_TEACHER";
  }
  check("사유 없는 지도자 취소 거부", (await teachers[approvedList[14].teacherIdx].req(`/api/teacher/bookings/${approvedList[14].id}`, "POST", { action: "cancel" })).status === 400);
  check("남의 예약 취소 불가", (await students[(approvedList[14].studentIdx + 1) % N_STUDENTS].req(`/api/bookings/${approvedList[14].id}/cancel`, "POST", {})).status === 403);
  check("이미 취소된 예약 재취소 거부", (await students[cancelA[0].studentIdx].req(`/api/bookings/${cancelA[0].id}/cancel`, "POST", {})).status === 409);
  const rejectedOne = requested.find((b) => b.expect === "REJECTED");
  if (rejectedOne) check("거절된 예약 취소 시도 거부", (await students[rejectedOne.studentIdx].req(`/api/bookings/${rejectedOne.id}/cancel`, "POST", {})).status === 409);

  // ───────── 8. 수업 진행 · 완료 · 노쇼 · 자동완료 ─────────
  section("8. 수업 완료 · 불참 · 자동 완료 · 정산");
  const remaining = requested.filter((b) => b.expect === "APPROVED");
  const toComplete = remaining.slice(0, Math.floor(remaining.length * 0.6)), toNoshow = remaining.slice(toComplete.length, toComplete.length + 4);
  const toAuto = remaining.slice(toComplete.length + 4, toComplete.length + 8), stayFuture = remaining.slice(toComplete.length + 8);
  check("수업 전 완료 처리 거부", (await teachers[toComplete[0].teacherIdx].req(`/api/teacher/bookings/${toComplete[0].id}`, "POST", { action: "complete" })).status === 409);
  const pastIds = [...toComplete, ...toNoshow].map((b) => b.scheduleId);
  await db.update(schema.schedules).set({ startsAt: new Date(Date.now() - 5 * HOUR), endsAt: new Date(Date.now() - 4 * HOUR) }).where(inArray(schema.schedules.id, pastIds));
  await batch(toComplete, 10, async (b) => {
    const r = await teachers[b.teacherIdx].req(`/api/teacher/bookings/${b.id}`, "POST", { action: "complete" });
    check("완료 처리 성공", r.status === 200, r.data); b.expect = "COMPLETED";
  });
  for (const b of toNoshow) {
    const r = await teachers[b.teacherIdx].req(`/api/teacher/bookings/${b.id}`, "POST", { action: "noshow" });
    check("수강생 불참 처리 성공", r.status === 200, r.data); b.expect = "NO_SHOW_USER";
  }
  await db.update(schema.schedules).set({ startsAt: new Date(Date.now() - 60 * HOUR), endsAt: new Date(Date.now() - 59 * HOUR) }).where(inArray(schema.schedules.id, toAuto.map((b) => b.scheduleId)));
  const sweep3 = await admin.req("/api/cron/sweep", "GET", undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` });
  check(`수업 종료 48시간 경과 ${toAuto.length}건 자동 완료`, sweep3.data.autoCompleted === toAuto.length, sweep3.data);
  for (const b of toAuto) b.expect = "COMPLETED";
  check("완료된 예약은 취소 불가", (await students[toComplete[0].studentIdx].req(`/api/bookings/${toComplete[0].id}/cancel`, "POST", {})).status === 409);
  const stlApi = await teachers[toComplete[0].teacherIdx].req("/api/teacher/settlements");
  check("지도자 정산 목록 조회", stlApi.status === 200 && stlApi.data.settlements.length >= 1);
  check("정산 요약 = 목록 합계", stlApi.data.summary.pending === stlApi.data.settlements.filter((s: any) => s.status === "PENDING").reduce((a: number, s: any) => a + s.netAmount, 0));
  const adminStl = await admin.req("/api/admin/settlements");
  const payOne = adminStl.data.settlements.find((s: any) => s.status === "PENDING");
  check("운영자 정산 지급 완료 표시", (await admin.req(`/api/admin/settlements/${payOne.id}`, "POST")).status === 200);
  check("지급 완료 정산 재지급 거부", (await admin.req(`/api/admin/settlements/${payOne.id}`, "POST")).status === 409);

  // ───────── 9. 후기 · 평점 ─────────
  section("9. 후기 · 평점 (동시 작성 포함)");
  const completed = [...toComplete, ...toAuto];
  const reviewRes = await batch(completed, 10, async (b) => {
    if (chance(0.25)) return { status: 0, data: null as any };
    const rating = pick([5, 5, 5, 4, 4, 3, 2, 1]);
    return students[b.studentIdx].req("/api/reviews", "POST", { bookingId: b.id, rating, body: pick(REVIEW_TEXT) });
  });
  check("후기 작성 모두 성공", reviewRes.every((r) => r.status === 0 || r.status === 201), reviewRes.filter((r) => r.status && r.status !== 201).map((r) => r.data));
  console.log(`  · 후기 ${reviewRes.filter((r) => r.status === 201).length}건`);
  const first = completed[0];
  check("후기 중복 작성 거부", (await students[first.studentIdx].req("/api/reviews", "POST", { bookingId: first.id, rating: 5, body: "두 번째 후기입니다" })).status === 409 || reviewRes[0].status === 0);
  check("불참 처리된 예약에는 후기 불가", (await students[toNoshow[0].studentIdx].req("/api/reviews", "POST", { bookingId: toNoshow[0].id, rating: 1, body: "불참인데 후기" })).status === 400);
  check("남의 예약에 후기 불가", (await students[(first.studentIdx + 1) % N_STUDENTS].req("/api/reviews", "POST", { bookingId: first.id, rating: 5, body: "남의 후기" })).status === 404);
  check("6점 후기 거부", (await students[first.studentIdx].req("/api/reviews", "POST", { bookingId: completed[1].id, rating: 6, body: "육점" })).status === 400);
  const rvs = await teachers[first.teacherIdx].req("/api/teacher/reviews");
  const rv = rvs.data.reviews[0];
  if (rv) check("지도자 답글 작성", (await teachers[first.teacherIdx].req(`/api/reviews/${rv.id}/reply`, "POST", { reply: "감사합니다!" })).status === 200);
  if (rv) check("타 지도자는 답글 불가", (await teachers[(first.teacherIdx + 1) % 45].req(`/api/reviews/${rv.id}/reply`, "POST", { reply: "남의 답글" })).status === 404);

  // ───────── 10. 신고 · 노쇼 확정 · 후기 숨김 ─────────
  section("10. 신고 → 운영자 처리");
  const victim = completed[2];
  check("신고 접수", (await students[victim.studentIdx].req("/api/reports", "POST", { targetType: "BOOKING", targetId: victim.id, reason: "지도자가 오지 않았습니다." })).status === 201);
  let reps = await admin.req("/api/admin/reports");
  let rep = reps.data.reports.find((x: any) => x.targetId === victim.id);
  check("노쇼 확정 → 환불", (await admin.req(`/api/admin/reports/${rep.id}`, "POST", { action: "resolve", confirmTeacherNoShow: true, note: "확인" })).status === 200);
  victim.expect = "NO_SHOW_TEACHER";
  check("처리된 신고 재처리 거부", (await admin.req(`/api/admin/reports/${rep.id}`, "POST", { action: "dismiss" })).status === 409);
  if (rv) {
    check("후기 신고 접수", (await teachers[first.teacherIdx].req("/api/reports", "POST", { targetType: "REVIEW", targetId: rv.id, reason: "허위 후기입니다." })).status === 201);
    reps = await admin.req("/api/admin/reports");
    rep = reps.data.reports.find((x: any) => x.targetId === rv.id);
    check("후기 숨김 처리", (await admin.req(`/api/admin/reports/${rep.id}`, "POST", { action: "resolve", hideReview: true })).status === 200);
    const d = await students[0].req(`/api/teachers/${teacherId(first.teacherIdx)}`);
    check("숨긴 후기는 상세에서 안 보임", !d.data.reviews.some((x: any) => x.id === rv.id));
  }

  // ───────── 11. 메시지 ─────────
  section("11. 메시지");
  const th = await students[3].req("/api/threads", "POST", { teacherId: teacherId(3) });
  check("대화방 생성", th.status === 200 && th.data.id);
  check("같은 상대 대화방은 하나만", (await students[3].req("/api/threads", "POST", { teacherId: teacherId(3) })).data.id === th.data.id);
  await students[3].req(`/api/threads/${th.data.id}/messages`, "POST", { body: "안녕하세요, 문의드립니다" });
  await teachers[3].req(`/api/threads/${th.data.id}/messages`, "POST", { body: "네, 말씀하세요" });
  const msgs = await students[3].req(`/api/threads/${th.data.id}/messages`);
  check("양방향 메시지 2건", msgs.data.messages.length === 2 && msgs.data.messages[1].mine === false);
  check("제3자 열람 차단", (await students[4].req(`/api/threads/${th.data.id}/messages`)).status === 403);
  check("심사 대기 지도자에게 메시지 불가", (await students[3].req("/api/threads", "POST", { teacherId: teacherId(45) })).status === 404);
  check("빈 메시지 거부", (await students[3].req(`/api/threads/${th.data.id}/messages`, "POST", { body: "   " })).status === 400);
  const tl = await teachers[3].req("/api/threads");
  check("지도자 대화 목록에 수강생 이름", tl.data.threads.some((x: any) => x.asTeacher && x.counterpartName === students[3].name));

  // ───────── 12. DB 전수 검증 (불변식) ─────────
  section("12. DB 전수 검증 — 돈 · 좌석 · 평점 · 정산 불변식");
  const simUserIds = (await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, [...students, ...teachers].map((c) => c.email)))).map((u) => u.id);
  const B = await db.select().from(schema.bookings).where(inArray(schema.bookings.userId, simUserIds));
  const P = await db.select().from(schema.payments).where(inArray(schema.payments.bookingId, B.map((b) => b.id)));
  const R = P.length ? await db.select().from(schema.refunds).where(inArray(schema.refunds.paymentId, P.map((p) => p.id))) : [];
  const S = await db.select().from(schema.settlements).where(inArray(schema.settlements.bookingId, B.map((b) => b.id)));
  const V = await db.select().from(schema.reviews).where(inArray(schema.reviews.bookingId, B.map((b) => b.id)));
  const T = await db.select().from(schema.teachers).where(inArray(schema.teachers.id, [...teacherIdByEmail.values()]));
  const pay = new Map(P.map((p) => [p.bookingId, p]));
  const stl = new Map(S.map((s) => [s.bookingId, s]));

  // (a) 결제-환불 장부 정합
  let bad = 0;
  for (const p of P) {
    const sum = R.filter((r) => r.paymentId === p.id).reduce((a, r) => a + r.amount, 0);
    if (sum !== p.refundedAmount || p.refundedAmount > p.amount) bad++;
    const expectStatus = p.status === "READY" || p.status === "FAILED" || p.status === "CANCELED" ? p.status : p.refundedAmount === 0 ? "PAID" : p.refundedAmount >= p.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
    if (p.status !== expectStatus) bad++;
  }
  check(`결제 ${P.length}건: 환불 기록 합계 = 환불액, 상태 일치`, bad === 0, bad);

  // (b) 예약 상태 ↔ 환불/정산 규칙
  const fullRefund = ["REJECTED", "CANCELED_BY_TEACHER", "NO_SHOW_TEACHER"], noRefund = ["REQUESTED", "APPROVED", "COMPLETED", "NO_SHOW_USER"];
  const problems: string[] = [];
  for (const b of B) {
    const p = pay.get(b.id), s = stl.get(b.id);
    if (fullRefund.includes(b.status) && !(p?.status === "REFUNDED" && p.refundedAmount === b.amount)) problems.push(`${b.status} 미환불 ${b.id}`);
    if (b.status === "EXPIRED" && p?.status === "PAID") problems.push(`EXPIRED 인데 결제금 보유 ${b.id}`);
    if (noRefund.includes(b.status) && !(p?.status === "PAID" && p.refundedAmount === 0)) problems.push(`${b.status} 인데 결제 상태 ${p?.status}`);
    if (b.status === "CANCELED_BY_USER" && p && p.status !== "CANCELED" && ![0, Math.floor(b.amount / 2), b.amount].includes(p.refundedAmount)) problems.push(`사용자취소 환불율 이상 ${p.refundedAmount}/${b.amount}`);
    const shouldSettle = ["COMPLETED", "NO_SHOW_USER"].includes(b.status) || (b.status === "CANCELED_BY_USER" && p && p.status !== "CANCELED" && p.refundedAmount < b.amount);
    if (shouldSettle && !s) problems.push(`정산 누락 ${b.status} ${b.id}`);
    if (!shouldSettle && s) problems.push(`정산이 있으면 안 됨 ${b.status} ${b.id}`);
    if (s && p) {
      const gross = p.amount - p.refundedAmount, fee = Math.round(gross * FEE);
      if (s.grossAmount !== gross || s.feeAmount !== fee || s.netAmount !== gross - fee) problems.push(`정산 금액 오류 ${b.id}`);
    }
  }
  check(`예약 ${B.length}건: 상태별 환불·정산 규칙 준수`, problems.length === 0, problems.slice(0, 5));

  // (c) 시뮬레이션이 기대한 최종 상태와 DB 일치
  const expectMap: Record<string, string> = { REQUESTED: "REQUESTED", APPROVED: "APPROVED", REJECTED: "REJECTED", EXPIRED: "EXPIRED", EXPIRED_FAILED: "EXPIRED", PENDING_PAYMENT: "EXPIRED", CANCELED_100: "CANCELED_BY_USER", CANCELED_50: "CANCELED_BY_USER", CANCELED_0: "CANCELED_BY_USER", CANCELED_BY_TEACHER: "CANCELED_BY_TEACHER", COMPLETED: "COMPLETED", NO_SHOW_USER: "NO_SHOW_USER", NO_SHOW_TEACHER: "NO_SHOW_TEACHER" };
  const mism = book.filter((b) => { const row = B.find((x) => x.id === b.id); return row && expectMap[b.expect] && row.status !== expectMap[b.expect]; });
  check("시나리오 기대 상태 = DB 상태", mism.length === 0, mism.slice(0, 5).map((b) => [b.expect, B.find((x) => x.id === b.id)?.status]));

  // (d) 좌석 초과 없음 / 같은 사람 중복 없음
  const seatRows = await db.execute(sql`
    SELECT s.id, c.capacity, count(b.id) AS n FROM class_schedules s JOIN classes c ON c.id = s.class_id
    JOIN bookings b ON b.schedule_id = s.id AND b.status IN ('REQUESTED','APPROVED')
    GROUP BY s.id, c.capacity HAVING count(b.id) > c.capacity`);
  check("정원 초과 일정 없음 (전체 DB)", seatRows.rows.length === 0, seatRows.rows);
  const dupRows = await db.execute(sql`
    SELECT user_id, schedule_id, count(*) FROM bookings WHERE status IN ('REQUESTED','APPROVED') GROUP BY user_id, schedule_id HAVING count(*) > 1`);
  check("한 사람이 같은 일정 두 번 예약한 경우 없음", dupRows.rows.length === 0, dupRows.rows);

  // (e) 평점 = 보이는 후기 평균, 후기 수 = 보이는 후기 건수
  const rp: string[] = [];
  for (const t of T) {
    const mine = V.filter((v) => v.teacherId === t.id && !v.isHidden);
    const avg = mine.length ? mine.reduce((a, v) => a + v.rating, 0) / mine.length : 0;
    if (t.ratingCount !== mine.length || Math.abs(t.ratingAvg - avg) > 1e-6) rp.push(`${t.displayName}: DB ${t.ratingAvg.toFixed(3)}/${t.ratingCount} vs 실제 ${avg.toFixed(3)}/${mine.length}`);
  }
  check("지도자 평점·후기 수 = 실제 후기 집계", rp.length === 0, rp.slice(0, 5));
  const visible = new Map<string, number[]>();
  for (const v of V) if (!v.isHidden) visible.set(v.teacherId, [...(visible.get(v.teacherId) ?? []), v.rating]);
  const hiddenDrift = T.filter((t) => { const vis = visible.get(t.id) ?? []; const a = vis.length ? vis.reduce((x, y) => x + y, 0) / vis.length : 0; return Math.abs(t.ratingAvg - a) > 1e-6 || t.ratingCount !== vis.length; });
  check("숨긴 후기는 평점 계산에서도 제외 (화면과 일치)", hiddenDrift.length === 0, hiddenDrift.map((t) => t.displayName));
  check("후기는 모두 완료(또는 이후 노쇼 확정)된 본인 예약", V.every((v) => { const b = B.find((x) => x.id === v.bookingId); return b && b.userId === v.userId && ["COMPLETED", "NO_SHOW_TEACHER"].includes(b.status); }));

  // (f) 페널티 = 지도자 취소 1점 + 노쇼 2점
  const pen = T.filter((t) => {
    const mine = B.filter((b) => { const s = scheds.find((x) => x.id === b.scheduleId); return s && teacherId(s.teacherIdx) === t.id; });
    const expected = mine.filter((b) => b.status === "CANCELED_BY_TEACHER").length + 2 * mine.filter((b) => b.status === "NO_SHOW_TEACHER").length;
    return t.penaltyCount !== expected;
  });
  check("페널티 점수 = 취소 1점 + 노쇼 2점", pen.length === 0, pen.map((t) => [t.displayName, t.penaltyCount]));

  // (g) 돈의 흐름: 결제 총액 − 환불 총액 = 정산 매출 + 아직 진행 중인 예약 금액
  const paidTotal = P.filter((p) => ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status)).reduce((a, p) => a + p.amount, 0);
  const refundTotal = R.reduce((a, r) => a + r.amount, 0);
  const settledGross = S.reduce((a, s) => a + s.grossAmount, 0);
  const inFlight = B.filter((b) => ["REQUESTED", "APPROVED"].includes(b.status)).reduce((a, b) => a + b.amount, 0);
  check(`돈 보존: 결제 ${paidTotal.toLocaleString()} − 환불 ${refundTotal.toLocaleString()} = 정산 ${settledGross.toLocaleString()} + 진행중 ${inFlight.toLocaleString()}`,
    paidTotal - refundTotal === settledGross + inFlight, { gap: paidTotal - refundTotal - settledGross - inFlight });
  const feeTotal = S.reduce((a, s) => a + s.feeAmount, 0), netTotal = S.reduce((a, s) => a + s.netAmount, 0);
  check("정산: 매출 = 수수료 + 지도자 지급액", settledGross === feeTotal + netTotal);
  console.log(`  · 플랫폼 수수료 수입 ${feeTotal.toLocaleString()}원 / 지도자 지급 예정 ${netTotal.toLocaleString()}원`);

  // (h) 알림 도착률
  const N = await db.select({ userId: schema.notifications.userId, type: schema.notifications.type, link: schema.notifications.link }).from(schema.notifications).where(inArray(schema.notifications.userId, simUserIds));
  const missing = B.filter((b) => {
    const want = b.status === "APPROVED" || b.status === "COMPLETED" || b.status === "NO_SHOW_USER" ? "BOOKING_APPROVED" : b.status === "REJECTED" ? "BOOKING_REJECTED" : b.status === "EXPIRED" && b.responseDeadline ? "BOOKING_EXPIRED" : null;
    return want && !N.some((n) => n.userId === b.userId && n.type === want && n.link.includes(b.id));
  });
  check("승인·거절·만료 예약마다 수강생 알림 존재", missing.length === 0, missing.slice(0, 3).map((b) => [b.status, b.id]));

  // (i) 화면 API 정합: 수강생 예약 목록 · 지도자 예약 목록
  const sample = students.slice(0, 10);
  let listBad = 0;
  for (const c of sample) {
    const r = await c.req("/api/bookings");
    for (const x of r.data.bookings) {
      if (!["APPROVED", "COMPLETED"].includes(x.status) && x.location) listBad++;
      if (x.status === "PENDING_PAYMENT") listBad++;
      if (x.canReview && x.status !== "COMPLETED") listBad++;
    }
  }
  check("예약 목록: 미확정 장소 비공개 · 결제 대기 노출 없음 · 후기 가능 표시 정확", listBad === 0, listBad);
  const tb = await teachers[0].req("/api/teacher/bookings");
  check("지도자 예약 목록에 결제 전 이탈 주문 없음", !tb.data.bookings.some((x: any) => x.status === "PENDING_PAYMENT"));

  console.log(`\n══════ 결과: ${pass}개 통과 / ${fail}개 실패 ══════`);
  if (fail) console.log("실패 항목:\n - " + failures.join("\n - "));
  await pool.end();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
