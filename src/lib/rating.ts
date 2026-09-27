import { and, eq, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";

const { reviews, teachers } = schema;

/**
 * 지도자 평점·후기 수를 "보이는 후기"만으로 다시 계산한다.
 * 후기 작성·숨김 등 후기가 바뀌는 모든 곳에서 호출 — 화면에 보이는 후기와 평점이 항상 일치하도록.
 * 지도자 행을 잠가 동시 작성 시에도 정확하다.
 */
export async function recalcTeacherRating(tx: Tx, teacherId: string) {
  await tx.execute(sql`SELECT id FROM teachers WHERE id = ${teacherId} FOR UPDATE`);
  const [agg] = await tx.select({ avg: sql<number>`coalesce(avg(${reviews.rating}), 0)`, n: sql<number>`count(*)` })
    .from(reviews).where(and(eq(reviews.teacherId, teacherId), eq(reviews.isHidden, false)));
  await tx.update(teachers).set({ ratingAvg: Number(agg.avg), ratingCount: Number(agg.n) }).where(eq(teachers.id, teacherId));
}
