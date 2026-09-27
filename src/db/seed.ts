/**
 * 초기 데이터
 *   npm run db:seed            → 관리자 계정만 생성 (운영 서버용)
 *   npm run db:seed -- --demo  → 관리자 + 데모 지도자/클래스/후기 (개발·시연용, 운영 DB에 넣지 말 것)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, pool, schema } from "./index";

const { users, teachers, classes, schedules, bookings, payments, reviews, settlements, userPreferences } = schema;
const HOUR = 3_600_000, DAY = 24 * HOUR;

async function ensureUser(email: string, password: string, name: string, role: "USER" | "TEACHER" | "ADMIN") {
  const found = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (found) return found;
  const [u] = await db.insert(users).values({ email, name, role, passwordHash: await bcrypt.hash(password, 12) }).returning();
  return u;
}

/** 다음 N일 중 KST 기준 특정 시각 */
function kst(daysFromNow: number, hh: number, mm = 0) {
  const now = new Date(Date.now() + 9 * HOUR);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromNow, hh - 9, mm));
  return d;
}

const DEMO = [
  { email: "doyun@demo.local", name: "김도윤", region: "강남구", lat: 37.4979, lng: 127.0276, verified: true,
    tagline: "처음 시작하는 마음챙김", tags: ["스트레스/불안 완화", "마음챙김", "입문", "저녁"],
    bio: "10년간 직장인 마음챙김 프로그램을 진행해온 지도자입니다. 처음 명상을 접하는 분들이 편안하게 시작할 수 있도록 안내합니다.",
    cert: "마음챙김 지도자 과정 수료 · 명상심리상담 수료",
    classes: [
      { title: "초보자를 위한 마음챙김 30분", price: 45000, format: "OFFLINE" as const, capacity: 6, duration: 30, location: "서울 강남구 테헤란로 (확정 후 상세 안내)", slots: [[2, 19], [4, 10], [9, 19]] },
      { title: "점심시간 5분 리셋", price: 15000, format: "ONLINE" as const, capacity: 20, duration: 15, location: "확정 후 화상 링크 안내", slots: [[3, 12], [5, 12]] },
    ], ratings: [5, 5, 5, 4, 5] },
  { email: "seoyun@demo.local", name: "이서윤", region: "마포구", lat: 37.5663, lng: 126.9019, verified: true,
    tagline: "잠들기 전 바디스캔", tags: ["수면 개선", "바디스캔", "입문", "저녁"],
    bio: "수면 문제로 고민하는 분들을 위한 바디스캔·이완 중심 명상을 진행합니다. 편안한 목소리로 깊은 이완을 안내해드려요.",
    cert: "요가 지도자 자격 · 수면명상 전문과정 이수",
    classes: [{ title: "숙면을 위한 바디스캔", price: 38000, format: "ONLINE" as const, capacity: 10, duration: 45, location: "확정 후 화상 링크 안내", slots: [[2, 21], [5, 21], [8, 21]] }],
    ratings: [5, 4, 5] },
  { email: "haneul@demo.local", name: "정하늘", region: "서초구", lat: 37.4837, lng: 127.0324, verified: true,
    tagline: "호흡으로 되찾는 집중", tags: ["집중력 향상", "호흡명상", "중급", "아침"],
    bio: "호흡 기반 집중력 향상 클래스를 운영하며, 직장인과 수험생을 다수 지도했습니다. 체계적인 호흡 훈련을 알려드립니다.",
    cert: "명상 지도자 과정 수료",
    classes: [{ title: "호흡으로 집중력 끌어올리기", price: 50000, format: "OFFLINE" as const, capacity: 4, duration: 60, location: "서울 서초구 (확정 후 상세 안내)", slots: [[3, 7], [6, 7], [10, 20]] }],
    ratings: [5, 5, 5, 5, 4, 5] },
  { email: "jimin@demo.local", name: "오지민", region: "성동구", lat: 37.5634, lng: 127.0369, verified: false,
    tagline: "싱잉볼 소리명상", tags: ["영적 성장", "소리명상", "중급", "주말"],
    bio: "싱잉볼과 소리 명상을 통해 내면의 소리에 귀 기울이는 시간을 안내합니다. 주말 오후의 여유로운 명상을 함께해요.",
    cert: "사운드힐링 지도자 과정 수료",
    classes: [{ title: "싱잉볼 소리명상", price: 42000, format: "OFFLINE" as const, capacity: 8, duration: 60, location: "서울 성동구 (확정 후 상세 안내)", slots: [[4, 15], [11, 15]] }],
    ratings: [4, 5] },
];

const REVIEW_TEXTS = [
  "처음이라 걱정했는데 정말 편안하게 안내해주셨어요.",
  "퇴근 후 듣기 좋았습니다. 다음에도 신청할게요.",
  "설명이 명확하고 차분해서 집중이 잘 됐어요.",
  "공간도 분위기도 좋았습니다.",
  "기대 이상이었어요. 추천합니다.",
  "목소리가 편안해서 금방 이완됐습니다.",
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL, adminPw = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPw || adminPw.length < 8) throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD(8자 이상) 환경변수를 설정하세요.");
  await ensureUser(adminEmail, adminPw, "운영자", "ADMIN");
  console.log(`✓ 관리자 계정: ${adminEmail}`);

  if (!process.argv.includes("--demo")) return;
  if (process.env.NODE_ENV === "production") throw new Error("운영 환경에는 데모 데이터를 넣을 수 없습니다.");
  if (await db.query.teachers.findFirst()) { console.log("· 데모 데이터가 이미 있어 건너뜁니다."); return; }

  const students = [];
  for (let i = 0; i < 6; i++) students.push(await ensureUser(`student${i + 1}@demo.local`, "demo1234!", ["서하은", "박민준", "최지우", "한도현", "윤서아", "신유준"][i], "USER"));
  const demoUser = await ensureUser("demo@demo.local", "demo1234!", "데모회원", "USER");
  await db.insert(userPreferences).values({ userId: demoUser.id, motives: ["스트레스/불안 완화"], types: ["마음챙김"], level: "입문", time: "저녁" }).onConflictDoNothing();

  for (const d of DEMO) {
    const u = await ensureUser(d.email, "demo1234!", d.name, "TEACHER");
    const [t] = await db.insert(teachers).values({
      userId: u.id, displayName: d.name, tagline: d.tagline, bio: d.bio, certification: d.cert, region: d.region,
      latitude: d.lat, longitude: d.lng, tags: d.tags, status: "APPROVED", verified: d.verified,
      createdAt: new Date(Date.now() - 90 * DAY),
    }).returning();

    for (const c of d.classes) {
      const [cls] = await db.insert(classes).values({
        teacherId: t.id, title: c.title, description: `${d.tagline} — ${c.title} 클래스입니다.`, format: c.format,
        location: c.location, capacity: c.capacity, price: c.price, durationMinutes: c.duration,
      }).returning();
      for (const [day, hour] of c.slots) {
        const s = kst(day, hour);
        await db.insert(schedules).values({ classId: cls.id, startsAt: s, endsAt: new Date(s.getTime() + c.duration * 60_000) });
      }
    }

    // 지난 수업 + 완료된 예약 + 후기 (평점 표시용)
    const [firstClass] = await db.select().from(classes).where(eq(classes.teacherId, t.id));
    let sum = 0;
    for (let i = 0; i < d.ratings.length; i++) {
      const start = kst(-(i + 3), 19);
      const [s] = await db.insert(schedules).values({ classId: firstClass.id, startsAt: start, endsAt: new Date(start.getTime() + 3_600_000) }).returning();
      const stu = students[i % students.length];
      const [b] = await db.insert(bookings).values({ userId: stu.id, scheduleId: s.id, status: "COMPLETED", amount: firstClass.price, createdAt: new Date(start.getTime() - 5 * DAY) }).returning();
      await db.insert(payments).values({ bookingId: b.id, orderId: `DEMO${randomUUID().slice(0, 12)}`, provider: "mock", providerPaymentKey: `mock_demo_${b.id}`, amount: firstClass.price, status: "PAID", paidAt: new Date(start.getTime() - 5 * DAY), method: "카드(테스트)" });
      const fee = Math.round(firstClass.price * 0.15);
      await db.insert(settlements).values({ teacherId: t.id, bookingId: b.id, grossAmount: firstClass.price, feeAmount: fee, netAmount: firstClass.price - fee });
      await db.insert(reviews).values({ bookingId: b.id, userId: stu.id, teacherId: t.id, rating: d.ratings[i], body: REVIEW_TEXTS[i % REVIEW_TEXTS.length], createdAt: new Date(start.getTime() + DAY) });
      sum += d.ratings[i];
    }
    await db.update(teachers).set({ ratingAvg: sum / d.ratings.length, ratingCount: d.ratings.length }).where(eq(teachers.id, t.id));
  }

  // 심사 대기 지도자 (운영자 콘솔 시연용)
  const applicant = await ensureUser("applicant@demo.local", "demo1234!", "강예린", "TEACHER");
  await db.insert(teachers).values({
    userId: applicant.id, displayName: "강예린", tagline: "걷기명상 산책", region: "용산구", tags: ["걷기명상", "입문"],
    bio: "한강변을 걸으며 감각에 집중하는 걷기명상을 안내하고 싶습니다. 3년간 소규모 모임을 운영했습니다.",
    certification: "명상 입문 지도 과정 수료 (증빙 링크 첨부)", status: "PENDING",
  });

  console.log("✓ 데모 데이터 생성 완료");
  console.log("  데모 회원: demo@demo.local / demo1234!");
  console.log("  데모 지도자: doyun@demo.local / demo1234!  (그 외 seoyun, haneul, jimin)");
}

main().then(() => pool.end()).catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
