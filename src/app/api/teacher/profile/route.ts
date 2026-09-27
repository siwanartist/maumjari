import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { teacherProfileSchema } from "@/lib/teacher-validators";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { teacher } = await requireTeacher();
  return ok({ teacher });
});

export const PATCH = handler(async (req: Request) => {
  const { teacher } = await requireTeacher();
  const b = await parseBody(req, teacherProfileSchema);
  // 반려된 지도자가 수정하면 재심사 대기로 전환
  const status = teacher.status === "REJECTED" ? "PENDING" : teacher.status;
  await db.update(schema.teachers).set({ ...b, status }).where(eq(schema.teachers.id, teacher.id));
  return ok({ ok: true, status });
});
