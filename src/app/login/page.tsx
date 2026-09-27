"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api("/api/auth/login", { body: { email, password } }); router.replace(next.startsWith("/") ? next : "/"); router.refresh(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <main className="shell">
      <form className="pad" onSubmit={submit}>
        <h1 style={{ fontSize: 22, marginTop: 30 }}>로그인</h1>
        <label className="label" htmlFor="email">이메일</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label" htmlFor="pw">비밀번호</label>
        <input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p className="error">{err}</p>}
        <button className="btn btn-primary" style={{ marginTop: 18 }} disabled={busy}>{busy ? "로그인 중…" : "로그인"}</button>
        <p className="center small muted" style={{ marginTop: 16 }}>계정이 없으신가요? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn-text">회원가입</Link></p>
      </form>
    </main>
  );
}
export default function LoginPage() { return <Suspense><LoginForm /></Suspense>; }
