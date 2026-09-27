import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handler, ApiError } from "@/lib/api";
import { isProvider, isEnabled, authorizeUrl, newState, OAUTH_STATE_COOKIE } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** 소셜 로그인 시작: CSRF 방지용 state 를 쿠키에 심고 제공자 로그인 화면으로 보낸다 */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ provider: string }> }) => {
  const { provider } = await ctx.params;
  if (!isProvider(provider) || !isEnabled(provider)) throw new ApiError(404, "지원하지 않는 로그인 방식입니다.");
  const next = new URL(req.url).searchParams.get("next") ?? "/";
  const state = newState();
  (await cookies()).set(OAUTH_STATE_COOKIE, JSON.stringify({ state, next: next.startsWith("/") ? next : "/" }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(provider, req, state));
});
