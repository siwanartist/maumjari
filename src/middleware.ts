import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// 로그인이 필요한 화면 — 비로그인 시 로그인 페이지로 (API 권한은 각 라우트에서 별도로 검사)
const PROTECTED = ["/bookings", "/book", "/profile", "/messages", "/notifications", "/teacher", "/admin"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (s) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
