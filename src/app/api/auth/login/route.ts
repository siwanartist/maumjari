import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { checkPassword, startSession } from "@/lib/auth";

const body = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

export const POST = handler(async (req: Request) => {
  const b = await parseBody(req, body);
  const u = await db.query.users.findFirst({ where: eq(schema.users.email, b.email) });
  // 이메일 존재 여부를 노출하지 않도록 동일한 메시지 사용
  if (u && !u.passwordHash) throw new ApiError(401, "구글 또는 네이버로 가입한 계정입니다. 아래 간편 로그인 버튼을 이용해주세요.");
  if (!u || !(await checkPassword(b.password, u.passwordHash!)))
    throw new ApiError(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  await startSession(u.id, u.role);
  return ok({ id: u.id, role: u.role });
});
