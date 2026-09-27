/**
 * 소셜 로그인 (OAuth 2.0 인가 코드 방식) — 구글 · 네이버
 * 흐름: /api/auth/oauth/{provider} → 제공자 로그인 화면 → /api/auth/oauth/{provider}/callback → 세션 시작
 * 외부 라이브러리 없이 fetch 로 토큰 교환·프로필 조회를 한다.
 */
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError } from "./api";

export const OAUTH_STATE_COOKIE = "mj_oauth";
export type Provider = "google" | "naver";
export type Profile = { id: string; email: string; emailVerified: boolean; name: string };

type Config = {
  label: string;
  authUrl: string; tokenUrl: string; scope?: string;
  clientId: () => string | undefined; clientSecret: () => string | undefined;
  profile: (accessToken: string) => Promise<Profile>;
};

const PROVIDERS: Record<Provider, Config> = {
  google: {
    label: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    async profile(token) {
      const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token}` } });
      if (!r.ok) throw new ApiError(502, "구글 프로필을 가져오지 못했습니다.");
      const j = await r.json();
      return { id: String(j.sub), email: (j.email ?? "").toLowerCase(), emailVerified: j.email_verified === true, name: j.name ?? "" };
    },
  },
  naver: {
    label: "네이버",
    authUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    clientId: () => process.env.NAVER_CLIENT_ID,
    clientSecret: () => process.env.NAVER_CLIENT_SECRET,
    async profile(token) {
      const r = await fetch("https://openapi.naver.com/v1/nid/me", { headers: { authorization: `Bearer ${token}` } });
      if (!r.ok) throw new ApiError(502, "네이버 프로필을 가져오지 못했습니다.");
      const j = (await r.json()).response ?? {};
      // 네이버는 본인 인증된 계정의 이메일을 제공한다 (제공 동의 항목)
      return { id: String(j.id), email: (j.email ?? "").toLowerCase(), emailVerified: !!j.email, name: j.name ?? j.nickname ?? "" };
    },
  },
};

/** 자동 테스트용: OAUTH_MOCK_URL 이 있으면 제공자 주소를 가짜 서버로 바꿔 끼운다 (scripts/oauth-mock.ts) */
function cfg(p: Provider): Config {
  const c = PROVIDERS[p], mock = process.env.OAUTH_MOCK_URL;
  if (!mock) return c;
  return { ...c, authUrl: `${mock}/${p}/authorize`, tokenUrl: `${mock}/${p}/token`,
    async profile(token) { const r = await fetch(`${mock}/${p}/me`, { headers: { authorization: `Bearer ${token}` } }); return r.json(); } };
}

export const isProvider = (p: string): p is Provider => p === "google" || p === "naver";
export const isEnabled = (p: Provider) => !!(PROVIDERS[p].clientId() && PROVIDERS[p].clientSecret());
export const enabledProviders = () => (Object.keys(PROVIDERS) as Provider[]).filter(isEnabled);

/** 콜백 주소 — OAUTH_REDIRECT_BASE 가 있으면 그 주소, 없으면 지금 접속한 주소 기준 */
export function redirectUri(provider: Provider, req: Request) {
  const h = req.headers;
  const origin = process.env.OAUTH_REDIRECT_BASE?.replace(/\/$/, "")
    ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return `${origin}/api/auth/oauth/${provider}/callback`;
}

export const newState = () => randomBytes(24).toString("base64url");

export function authorizeUrl(provider: Provider, req: Request, state: string) {
  const c = cfg(provider);
  const q = new URLSearchParams({ response_type: "code", client_id: c.clientId()!, redirect_uri: redirectUri(provider, req), state });
  if (c.scope) q.set("scope", c.scope);
  if (provider === "google") q.set("prompt", "select_account");
  return `${c.authUrl}?${q}`;
}

export async function exchangeCode(provider: Provider, req: Request, code: string, state: string): Promise<Profile> {
  const c = cfg(provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code", code, client_id: c.clientId()!, client_secret: c.clientSecret()!,
    redirect_uri: redirectUri(provider, req), state,
  });
  const r = await fetch(c.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new ApiError(502, `${c.label} 로그인에 실패했습니다. 다시 시도해주세요.`);
  return c.profile(j.access_token);
}

/**
 * 소셜 프로필로 사용자 찾기/만들기
 * 1) 같은 제공자 계정이 이미 연결돼 있으면 그 사용자
 * 2) 인증된 이메일이 기존 회원과 같으면 그 회원에 연결 (다른 서비스들의 일반적인 방식)
 * 3) 아니면 새 회원 생성 (비밀번호 없음)
 */
export async function findOrCreateUser(provider: Provider, p: Profile) {
  const { users, oauthAccounts } = schema;
  const linked = await db.query.oauthAccounts.findFirst({ where: and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, p.id)) });
  if (linked) {
    const u = await db.query.users.findFirst({ where: eq(users.id, linked.userId) });
    if (u) return { user: u, created: false };
  }
  if (!p.email || !p.emailVerified) throw new ApiError(400, `${PROVIDERS[provider].label} 계정에서 이메일 제공에 동의해주세요.`);
  return db.transaction(async (tx) => {
    let u = await tx.query.users.findFirst({ where: eq(users.email, p.email) });
    let created = false;
    if (!u) {
      [u] = await tx.insert(users).values({ email: p.email, name: (p.name || p.email.split("@")[0]).slice(0, 20), passwordHash: null }).returning();
      created = true;
    }
    await tx.insert(oauthAccounts).values({ userId: u.id, provider, providerUserId: p.id, email: p.email }).onConflictDoNothing();
    return { user: u, created };
  });
}
