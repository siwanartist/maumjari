import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { scheduleSchema } from "@/lib/teacher-validators";

const { classes, schedules } = schema;
const DAY = 86_400_000;

/** 스케줄 추가: 단발(여러 일시) 또는 매주 반복. 시각은 한국시간(KST, UTC+9) 기준 */
export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const { teacher } = await requireTeacher();
  const [c] = await db.select().from(classes).where(and(eq(classes.id, params.id), eq(classes.teacherId, teacher.id)));
  if (!c) throw new ApiError(404, "클래스를 찾을 수 없습니다.");
  const b = await parseBody(req, scheduleSchema);

  let starts: Date[];
  if (b.mode === "once") starts = b.startsAt;
  else {
    starts = [];
    const base = new Date(`${b.fromDate}T${b.time}:00+09:00`);
    for (let d = 0; d < b.weeks * 7; d++) {
      const dt = new Date(base.getTime() + d * DAY);
      const kstWeekday = new Date(dt.getTime() + 9 * 3_600_000).getUTCDay();
      if (b.weekdays.includes(kstWeekday)) starts.push(dt);
    }
  }
  starts = starts.filter((s) => s.getTime() > Date.now());
  if (!starts.length) throw new ApiError(400, "추가할 수 있는 미래 일정이 없습니다.");
  await db.insert(schedules).values(starts.map((s) => ({
    classId: c.id, startsAt: s, endsAt: new Date(s.getTime() + c.durationMinutes * 60_000),
  })));
  return ok({ added: starts.length }, 201);
});
