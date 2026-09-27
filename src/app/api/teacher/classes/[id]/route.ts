import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { classSchema } from "@/lib/teacher-validators";

const { classes } = schema;

export const PATCH = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const { teacher } = await requireTeacher();
  const b = await parseBody(req, classSchema.partial());
  // 가격 변경은 이후 새 예약부터 적용 (기존 예약은 결제 시점 금액 유지)
  const r = await db.update(classes).set(b).where(and(eq(classes.id, params.id), eq(classes.teacherId, teacher.id))).returning({ id: classes.id });
  if (!r.length) throw new ApiError(404, "클래스를 찾을 수 없습니다.");
  return ok({ ok: true });
});
