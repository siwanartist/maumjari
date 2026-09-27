"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Avatar from "@/components/Avatar";
import { api, PENDING_PREFS_KEY } from "@/lib/client";

type Me = {
  user: { name: string; email: string; bio: string; region: string; role: string } | null;
  preference: { motives: string[]; types: string[]; level: string; time: string } | null;
  teacher: { status: string; rejectReason: string } | null;
};
const TEACHER_STATUS: Record<string, string> = { PENDING: "심사 중", APPROVED: "활동 중", REJECTED: "반려됨", SUSPENDED: "정지됨" };

export default function Profile() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [f, setF] = useState({ name: "", bio: "", region: "" });
  const [msg, setMsg] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Me>("/api/me").then((d) => {
      if (!d.user) { router.replace("/login?next=/profile"); return; }
      setMe(d); setF({ name: d.user.name, bio: d.user.bio, region: d.user.region });
    });
  }, [router]);

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    try { await api("/api/me", { method: "PATCH", body: f }); setMsg("저장되었습니다."); setTimeout(() => setMsg(""), 2000); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    localStorage.removeItem(PENDING_PREFS_KEY);
    router.replace("/login"); router.refresh();
  }

  if (!me?.user) return <main className="shell"><div className="pad"><div className="skeleton" /></div></main>;
  const p = me.preference;

  return (
    <main className="shell">
      <TopBar title="프로필" />
      <section className="pad" style={{ paddingTop: 0 }}>
        <div className="row" style={{ gap: 14, marginBottom: 8 }}>
          <Avatar name={f.name} size={64} />
          <div><b>{me.user.name}</b><div className="muted small">{me.user.email}</div></div>
        </div>
        <label className="label" htmlFor="n">닉네임</label>
        <input id="n" className="input" maxLength={20} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <label className="label" htmlFor="b">한 줄 소개</label>
        <textarea id="b" className="textarea" maxLength={200} placeholder="나를 소개하는 한 마디" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        <label className="label" htmlFor="r">활동 지역</label>
        <input id="r" className="input" maxLength={40} placeholder="예: 강남구" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} />
        {err && <p className="error">{err}</p>}
        <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장하기"}</button>
        {msg && <p className="success center">{msg}</p>}

        <div className="section-title" style={{ margin: "28px 0 8px" }}>나의 명상 취향</div>
        <p className="small muted" style={{ lineHeight: 1.8, margin: 0 }}>
          {p ? <>계기: {p.motives.join(", ")}<br />선호 유형: {p.types.join(", ")}<br />경험 수준: {p.level}<br />선호 시간대: {p.time}</> : "아직 취향 진단을 완료하지 않았습니다."}
        </p>
        <Link href="/onboarding" className="btn-text">취향 다시 진단하기</Link>

        <div className="section-title" style={{ margin: "28px 0 8px" }}>지도자</div>
        {me.teacher ? (
          <Link href="/teacher" className="card row between"><span>지도자센터</span><span className="badge" style={{ margin: 0 }}>{TEACHER_STATUS[me.teacher.status]}</span></Link>
        ) : (
          <Link href="/teacher/apply" className="card row between"><span>명상 지도자로 활동하기</span><span className="muted">→</span></Link>
        )}
        {me.user.role === "ADMIN" && <Link href="/admin" className="card row between"><span>운영 관리 콘솔</span><span className="muted">→</span></Link>}

        <div className="section-title" style={{ margin: "28px 0 8px" }}>기타</div>
        <Link href="/notifications" className="card row between"><span>알림</span><span className="muted">→</span></Link>
        <div className="row" style={{ gap: 16, marginTop: 8 }}>
          <Link href="/terms" className="link small">이용약관</Link>
          <Link href="/privacy" className="link small">개인정보처리방침</Link>
          <button className="link small" onClick={logout}>로그아웃</button>
        </div>
      </section>
      <BottomNav />
    </main>
  );
}
