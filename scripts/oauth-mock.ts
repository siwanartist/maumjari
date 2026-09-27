/**
 * 소셜 로그인 자동 테스트용 가짜 제공자 서버 (구글·네이버 흉내)
 *   OAUTH_MOCK_URL=http://localhost:3999 GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x NAVER_CLIENT_ID=x NAVER_CLIENT_SECRET=x 로 앱 실행
 *   /{provider}/authorize?...&state= → 즉시 콜백으로 되돌림 (code = 테스트 사용자 이메일)
 *   /{provider}/token                → access_token = code
 *   /{provider}/me                   → 토큰(=이메일)로 프로필 반환
 */
import http from "http";
const PORT = Number(process.env.OAUTH_MOCK_PORT ?? 3999);
http.createServer(async (req, res) => {
  const u = new URL(req.url!, `http://localhost:${PORT}`);
  const [, provider, step] = u.pathname.split("/");
  if (step === "authorize") {
    const who = u.searchParams.get("mock_user") ?? process.env.OAUTH_MOCK_USER ?? "tester@gmail.com";
    const back = new URL(u.searchParams.get("redirect_uri")!);
    back.searchParams.set("code", who); back.searchParams.set("state", u.searchParams.get("state")!);
    res.writeHead(302, { location: back.toString() }).end(); return;
  }
  if (step === "token") {
    let body = ""; for await (const c of req) body += c;
    const code = new URLSearchParams(body).get("code")!;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: code, token_type: "bearer" })); return;
  }
  if (step === "me") {
    const email = (req.headers.authorization ?? "").replace("Bearer ", "");
    const unverified = email.startsWith("unverified");
    res.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ id: `${provider}-${email}`, email: unverified ? "" : email, emailVerified: !unverified, name: `${provider} 사용자` })); return;
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(`oauth mock on ${PORT}`));
