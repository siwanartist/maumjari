import { and, eq, inArray, count } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";

const { classes, schedules, bookings } = schema;

/** 일정 닫기: 진행 중인 예약이 있으면 먼저 개별 거절/취소해야 한다 (환불·페널티 규칙을 우회하지 못하도록) */
export const DELETE = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const { teacher } = await requireTeacher();
  const [s] = await db.select({ id: schedules.id, teacherId: classes.teacherId }).from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id)).where(eq(schedules.id, params.id));
  if (!s || s.teacherId !== teacher.id) throw new ApiError(404, "일정을 찾을 수 없습니다.");
  const [{ n }] = await db.select({ n: count() }).from(bookings)
    .where(and(eq(bookings.scheduleId, s.id), inArray(bookings.status, ["PENDING_PAYMENT", "REQUESTED", "APPROVED"])));
  if (Number(n) > 0) throw new ApiError(409, "진행 중인 예약이 있는 일정입니다. 예약을 먼저 거절하거나 취소해주세요.");
  await db.update(schedules).set({ isCanceled: true }).where(eq(schedules.id, s.id));
  return ok({ ok: true });
});
