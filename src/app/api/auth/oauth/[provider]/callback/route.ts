import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isProvider, isEnabled, exchangeCode, findOrCreateUser, OAUTH_STATE_COOKIE } from "@/lib/oauth";
import { startSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** 제공자에서 돌아오는 곳: state 검증 → 코드 교환 → 회원 찾기/생성 → 세션 시작 → 원래 가려던 화면으로 */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  const origin = url.origin;
  const jar = await cookies();
  const saved = (() => { try { return JSON.parse(jar.get(OAUTH_STATE_COOKIE)?.value ?? ""); } catch { return null; } })() as { state: string; next: string } | null;
  jar.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  const fail = (msg: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);

  try {
    if (!isProvider(provider) || !isEnabled(provider)) return fail("지원하지 않는 로그인 방식입니다.");
    if (url.searchParams.get("error")) return fail("로그인이 취소되었습니다.");
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    if (!code || !state || !saved || saved.state !== state) return fail("로그인 요청이 만료되었습니다. 다시 시도해주세요.");
    const profile = await exchangeCode(provider, req, code, state);
    const { user } = await findOrCreateUser(provider, profile);
    await startSession(user.id, user.role);
    // /login/complete 에서 로그인 전 취향 진단 결과가 있으면 저장한 뒤 next 로 이동
    return NextResponse.redirect(`${origin}/login/complete?next=${encodeURIComponent(saved.next)}`);
  } catch (e) {
    if (e instanceof ApiError) return fail(e.message);
    console.error("[OAUTH ERROR]", e);
    return fail("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }
}
