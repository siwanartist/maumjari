import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { teacherProfileSchema } from "@/lib/teacher-validators";

/** 지도자 등록 신청 → 운영진 심사(PENDING) */
export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const exists = await db.query.teachers.findFirst({ where: eq(schema.teachers.userId, u.id) });
  if (exists) throw new ApiError(409, "이미 지도자 등록을 신청했습니다.");
  const b = await parseBody(req, teacherProfileSchema);
  await db.transaction(async (tx) => {
    await tx.insert(schema.teachers).values({ userId: u.id, ...b, status: "PENDING" });
    if (u.role === "USER") await tx.update(schema.users).set({ role: "TEACHER" }).where(eq(schema.users.id, u.id));
  });
  return ok({ ok: true }, 201);
});
