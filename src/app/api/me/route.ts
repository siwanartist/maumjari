import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const u = await getCurrentUser();
  if (!u) return ok({ user: null });
  const [preference, teacher] = await Promise.all([
    db.query.userPreferences.findFirst({ where: eq(schema.userPreferences.userId, u.id) }),
    db.query.teachers.findFirst({ where: eq(schema.teachers.userId, u.id) }),
  ]);
  return ok({
    user: { id: u.id, email: u.email, name: u.name, bio: u.bio, region: u.region, role: u.role },
    preference: preference ?? null,
    teacher: teacher ? { id: teacher.id, status: teacher.status, rejectReason: teacher.rejectReason } : null,
  });
});

const patch = z.object({
  name: z.string().trim().min(1, "닉네임을 입력해주세요.").max(20),
  bio: z.string().trim().max(200),
  region: z.string().trim().max(40),
});

export const PATCH = handler(async (req: Request) => {
  const u = await requireUser();
  const b = await parseBody(req, patch);
  await db.update(schema.users).set(b).where(eq(schema.users.id, u.id));
  return ok({ ok: true });
});
