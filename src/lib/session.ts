import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "mj_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14일

export type SessionPayload = { uid: string; role: "USER" | "TEACHER" | "ADMIN" };

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET 은 32자 이상이어야 합니다.");
  return new TextEncoder().encode(s);
}

export async function signSession(p: SessionPayload) {
  return new SignJWT(p)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.uid !== "string") return null;
    return { uid: payload.uid, role: payload.role as SessionPayload["role"] };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SEC,
};
