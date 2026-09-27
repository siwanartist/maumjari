import { and, desc, eq, gt, inArray, count, or } from "drizzle-orm";
import { PAYMENT_HOLD_MINUTES } from "@/lib/constants";
import { db, schema } from "@/db";
import { handler, ok, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
const { teachers, classes, schedules, bookings, reviews, users } = schema;

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const t = await db.query.teachers.findFirst({ where: eq(teachers.id, params.id) });
  const me = await getCurrentUser();
  const isOwnerOrAdmin = me && (me.role === "ADMIN" || me.id === t?.userId);
  if (!t || (t.status !== "APPROVED" && !isOwnerOrAdmin)) throw new ApiError(404, "지도자를 찾을 수 없습니다.");

  const cls = await db.select().from(classes).where(and(eq(classes.teacherId, t.id), eq(classes.isPublished, true)));
  const now = new Date();
  const sch = cls.length
    ? await db.select().from(schedules).where(and(
        inArray(schedules.classId, cls.map((c) => c.id)), eq(schedules.isCanceled, false), gt(schedules.startsAt, now)))
        .orderBy(schedules.startsAt)
    : [];
  const holdCutoff = new Date(Date.now() - PAYMENT_HOLD_MINUTES * 60_000);
  // 남은 좌석 표시용 (최종 정원 확인은 예약 생성 시 잠금 상태에서 다시 한다)
  const taken = sch.length
    ? await db.select({ scheduleId: bookings.scheduleId, n: count() }).from(bookings).where(and(
        inArray(bookings.scheduleId, sch.map((s) => s.id)),
        or(inArray(bookings.status, ["REQUESTED", "APPROVED"]),
           and(eq(bookings.status, "PENDING_PAYMENT"), gt(bookings.createdAt, holdCutoff))),
      )).groupBy(bookings.scheduleId)
    : [];
  const takenMap = new Map(taken.map((r) => [r.scheduleId, Number(r.n)]));

  const revs = await db.select({
    id: reviews.id, rating: reviews.rating, body: reviews.body, reply: reviews.reply, createdAt: reviews.createdAt, userName: users.name,
  }).from(reviews).innerJoin(users, eq(reviews.userId, users.id))
    .where(and(eq(reviews.teacherId, t.id), eq(reviews.isHidden, false))).orderBy(desc(reviews.createdAt)).limit(50);

  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, n: revs.filter((r) => r.rating === star).length }));

  return ok({
    teacher: {
      id: t.id, displayName: t.displayName, tagline: t.tagline, bio: t.bio, certification: t.certification,
      region: t.region, tags: t.tags, verified: t.verified, status: t.status,
      profileImageUrl: t.profileImageUrl, coverImageUrl: t.coverImageUrl,
      ratingAvg: Math.round(t.ratingAvg * 10) / 10, ratingCount: t.ratingCount,
    },
    classes: cls.map((c) => ({
      id: c.id, title: c.title, description: c.description, format: c.format, capacity: c.capacity,
      price: c.price, durationMinutes: c.durationMinutes, bookingCutoffHours: c.bookingCutoffHours,
      // 상세 장소/접속 링크는 예약 확정자에게만 공개 (여기서는 비공개)
      schedules: sch.filter((s) => s.classId === c.id)
        .filter((s) => s.startsAt.getTime() - c.bookingCutoffHours * 3_600_000 > Date.now())
        .map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, seatsLeft: Math.max(0, c.capacity - (takenMap.get(s.id) ?? 0)) })),
    })),
    reviews: revs,
    ratingDistribution: dist,
  });
});
