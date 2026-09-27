import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok, ApiError } from "@/lib/api";
import { POLICY_TEXT } from "@/lib/policy";

export const dynamic = "force-dynamic";

/** 예약 화면용 일정 요약 */
export const GET = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const [row] = await db.select({
    id: schema.schedules.id, startsAt: schema.schedules.startsAt, endsAt: schema.schedules.endsAt, isCanceled: schema.schedules.isCanceled,
    classTitle: schema.classes.title, format: schema.classes.format, price: schema.classes.price, durationMinutes: schema.classes.durationMinutes,
    teacherId: schema.teachers.id, teacherName: schema.teachers.displayName, teacherStatus: schema.teachers.status,
  }).from(schema.schedules)
    .innerJoin(schema.classes, eq(schema.schedules.classId, schema.classes.id))
    .innerJoin(schema.teachers, eq(schema.classes.teacherId, schema.teachers.id))
    .where(eq(schema.schedules.id, params.id));
  if (!row || row.isCanceled || row.teacherStatus !== "APPROVED") throw new ApiError(404, "예약할 수 없는 일정입니다.");
  return ok({ schedule: row, policy: POLICY_TEXT });
});
