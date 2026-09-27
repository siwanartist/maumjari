import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";

const { bookings, schedules, classes, reviews, teachers } = schema;
const body = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(5, "후기는 5자 이상 작성해주세요.").max(1000),
});

/** 리뷰 작성: 수업 완료된 본인 예약에 한해 1회 */
export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const b = await parseBody(req, body);
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ userId: bookings.userId, status: bookings.status, teacherId: classes.teacherId })
      .from(bookings).innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
      .innerJoin(classes, eq(schedules.classId, classes.id)).where(eq(bookings.id, b.bookingId));
    if (!row || row.userId !== u.id) throw new ApiError(404, "예약을 찾을 수 없습니다.");
    if (row.status !== "COMPLETED") throw new ApiError(400, "수업을 완료한 예약에만 후기를 남길 수 있습니다.");
    const ins = await tx.insert(reviews).values({ bookingId: b.bookingId, userId: u.id, teacherId: row.teacherId, rating: b.rating, body: b.body })
      .onConflictDoNothing().returning({ id: reviews.id });
    if (ins.length === 0) throw new ApiError(409, "이미 후기를 작성했습니다.");
    // 평균 평점을 증분 갱신 (행 잠금으로 동시 작성 시에도 정확)
    await tx.execute(sql`SELECT id FROM teachers WHERE id = ${row.teacherId} FOR UPDATE`);
    await tx.update(teachers).set({
      ratingAvg: sql`(${teachers.ratingAvg} * ${teachers.ratingCount} + ${b.rating}) / (${teachers.ratingCount} + 1)`,
      ratingCount: sql`${teachers.ratingCount} + 1`,
    }).where(eq(teachers.id, row.teacherId));
  });
  return ok({ ok: true }, 201);
});
