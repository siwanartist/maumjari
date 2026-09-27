import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { recalcTeacherRating } from "@/lib/rating";

const { bookings, schedules, classes, reviews } = schema;
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
    // 지도자 행을 먼저 잠근다 — 후기를 먼저 넣으면(외래키 공유 잠금) 같은 지도자에게 동시에 후기가 들어올 때 교착이 난다
    await tx.execute(sql`SELECT id FROM teachers WHERE id = ${row.teacherId} FOR UPDATE`);
    const ins = await tx.insert(reviews).values({ bookingId: b.bookingId, userId: u.id, teacherId: row.teacherId, rating: b.rating, body: b.body })
      .onConflictDoNothing().returning({ id: reviews.id });
    if (ins.length === 0) throw new ApiError(409, "이미 후기를 작성했습니다.");
    await recalcTeacherRating(tx, row.teacherId);
  });
  return ok({ ok: true }, 201);
});
