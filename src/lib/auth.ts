import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { SESSION_COOKIE, verifySession, signSession, cookieOptions } from "./session";
import { ApiError } from "./api";

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 12); }
export async function checkPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

/** 현재 로그인 사용자 (DB 최신 정보 기준 — 역할 변경이 즉시 반영되도록) */
export async function getCurrentUser() {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, s.uid) });
  return user ?? null;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new ApiError(401, "로그인이 필요합니다.");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "ADMIN") throw new ApiError(403, "관리자만 접근할 수 있습니다.");
  return u;
}

/** 지도자 본인 (심사 상태 무관). approvedOnly 이면 승인된 지도자만 */
export async function requireTeacher(opts: { approvedOnly?: boolean } = {}) {
  const u = await requireUser();
  const t = await db.query.teachers.findFirst({ where: eq(schema.teachers.userId, u.id) });
  if (!t) throw new ApiError(403, "지도자 등록이 필요합니다.");
  if (opts.approvedOnly && t.status !== "APPROVED")
    throw new ApiError(403, "운영진 심사 승인 후 이용할 수 있습니다.");
  return { user: u, teacher: t };
}

export async function startSession(uid: string, role: "USER" | "TEACHER" | "ADMIN") {
  (await cookies()).set(SESSION_COOKIE, await signSession({ uid, role }), cookieOptions);
}
export async function endSession() {
  (await cookies()).set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
