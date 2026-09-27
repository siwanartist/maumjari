import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { hashPassword, startSession } from "@/lib/auth";
import { prefSchema } from "@/lib/validators";

const body = z.object({
  email: z.string().trim().toLowerCase().email("이메일 형식을 확인해주세요."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72),
  name: z.string().trim().min(1, "닉네임을 입력해주세요.").max(20),
  agreeTerms: z.literal(true, { errorMap: () => ({ message: "이용약관과 개인정보처리방침에 동의해주세요." }) }),
  prefs: prefSchema.optional(),
});

export const POST = handler(async (req: Request) => {
  const b = await parseBody(req, body);
  const exists = await db.query.users.findFirst({ where: eq(schema.users.email, b.email) });
  if (exists) throw new ApiError(409, "이미 가입된 이메일입니다.");
  const [u] = await db.insert(schema.users)
    .values({ email: b.email, passwordHash: await hashPassword(b.password), name: b.name })
    .returning();
  if (b.prefs) await db.insert(schema.userPreferences).values({ userId: u.id, ...b.prefs });
  await startSession(u.id, u.role);
  return ok({ id: u.id }, 201);
});
