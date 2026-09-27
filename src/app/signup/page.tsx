"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, loadPendingPrefs } from "@/lib/client";
import SocialLogin from "@/components/SocialLogin";

function SignupForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [f, setF] = useState({ email: "", password: "", name: "" });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const prefs = loadPendingPrefs() ?? undefined; // 가입 전에 한 온보딩 결과를 함께 저장
      await api("/api/auth/signup", { body: { ...f, agreeTerms: agree, prefs } });
      router.replace(prefs ? (next.startsWith("/") ? next : "/") : "/onboarding"); router.refresh();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <main className="shell">
      <form className="pad" onSubmit={submit}>
        <h1 style={{ marginTop: 30 }}>회원가입</h1>
        <p className="muted small" style={{ margin: "0 0 20px" }}>간편 로그인으로 가입하면 이용약관과 개인정보처리방침에 동의하는 것으로 봅니다.</p>
        <SocialLogin next={next} />
        <label className="label" htmlFor="name">닉네임</label>
        <input id="name" className="input" required maxLength={20} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <label className="label" htmlFor="email">이메일</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <label className="label" htmlFor="pw">비밀번호 (8자 이상)</label>
        <input id="pw" className="input" type="password" autoComplete="new-password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <label className="row small" style={{ marginTop: 16, alignItems: "flex-start" }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
          <span><Link href="/terms" className="btn-text" target="_blank">이용약관</Link>과 <Link href="/privacy" className="btn-text" target="_blank">개인정보처리방침</Link>에 동의합니다. (필수)</span>
        </label>
        {err && <p className="error">{err}</p>}
        <button className="btn btn-primary" style={{ marginTop: 18 }} disabled={busy || !agree}>{busy ? "가입 중…" : "가입하기"}</button>
        <p className="center small muted" style={{ marginTop: 16 }}>이미 계정이 있으신가요? <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-text">로그인</Link></p>
      </form>
    </main>
  );
}
export default function SignupPage() { return <Suspense><SignupForm /></Suspense>; }
