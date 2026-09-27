"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import Avatar from "@/components/Avatar";
import { api } from "@/lib/client";
import { fmtDateTime, fmtDate, won } from "@/lib/format";

type Detail = {
  teacher: { id: string; displayName: string; tagline: string; bio: string; certification: string; region: string; tags: string[];
    verified: boolean; profileImageUrl: string; coverImageUrl: string; ratingAvg: number; ratingCount: number; status: string };
  classes: { id: string; title: string; description: string; format: string; capacity: number; price: number; durationMinutes: number;
    schedules: { id: string; startsAt: string; seatsLeft: number }[] }[];
  reviews: { id: string; rating: number; body: string; reply: string; createdAt: string; userName: string }[];
  ratingDistribution: { star: number; n: number }[];
};
const TABS = [["profile", "프로필"], ["reviews", "평점"], ["classes", "클래스"], ["messages", "메시지"]] as const;

export default function TeacherDetail(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<string>("profile");
  const [msg, setMsg] = useState("");
  const [msgErr, setMsgErr] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { api<Detail>(`/api/teachers/${params.id}`).then(setD).catch((e) => setErr(e.message)); }, [params.id]);

  async function sendFirstMessage() {
    if (!msg.trim()) return;
    setSending(true); setMsgErr("");
    try {
      const { id } = await api<{ id: string }>("/api/threads", { body: { teacherId: params.id } });
      await api(`/api/threads/${id}/messages`, { body: { body: msg } });
      router.push(`/messages/${id}`);
    } catch (e: any) {
      if (e.status === 401) router.push(`/login?next=/teachers/${params.id}`);
      else { setMsgErr(e.message); setSending(false); }
    }
  }

  if (err) return <main className="shell"><div className="pad"><p className="error">{err}</p><button className="btn-text" onClick={() => router.push("/")}>홈으로</button></div><BottomNav /></main>;
  if (!d) return <main className="shell"><div className="cover" /><div className="pad"><div className="skeleton" /></div></main>;
  const t = d.teacher;

  return (
    <main className="shell">
      <div className="cover" style={t.coverImageUrl ? { backgroundImage: `url(${t.coverImageUrl})` } : undefined}>
        <button className="link" onClick={() => router.back()} style={{ color: "#fff", padding: 16 }} aria-label="뒤로">←</button>
      </div>
      <div className="dheader">
        <Avatar name={t.displayName} url={t.profileImageUrl} />
        <h2 style={{ marginTop: 10 }}>{t.displayName} {t.verified && <span className="badge solid">인증 지도자</span>}</h2>
        {t.tagline && <div className="small">{t.tagline}</div>}
        <div className="meta">{[t.region, t.ratingCount ? `★ ${t.ratingAvg.toFixed(1)} (${t.ratingCount})` : "신규 지도자"].filter(Boolean).join(" · ")}</div>
        {t.status !== "APPROVED" && <p className="badge warn">미리보기 — 심사 승인 전에는 다른 사용자에게 보이지 않습니다</p>}
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "sel" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      <section className="pad">
        {tab === "profile" && (
          <div>
            <p style={{ whiteSpace: "pre-wrap", marginTop: 0 }}>{t.bio}</p>
            {t.certification && <><div className="label">경력 · 자격</div><p className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{t.certification}</p></>}
            <div style={{ marginTop: 12 }}>{t.tags.map((x) => <span key={x} className="badge">#{x}</span>)}</div>
          </div>
        )}

        {tab === "reviews" && (
          <div>
            {d.reviews.length === 0 ? <p className="muted">아직 후기가 없습니다. 첫 수강생이 되어주세요.</p> : (
              <>
                <div className="row" style={{ alignItems: "flex-start", gap: 20, marginBottom: 10 }}>
                  <div><div style={{ fontSize: 30, fontFamily: "Sora" }}>{t.ratingAvg.toFixed(1)}</div><div className="muted small">후기 {t.ratingCount}개</div></div>
                  <div style={{ flex: 1 }}>{d.ratingDistribution.map((r) => (
                    <div key={r.star} className="row small" style={{ gap: 6 }}>
                      <span style={{ width: 18 }}>{r.star}★</span>
                      <div style={{ flex: 1, height: 5, background: "var(--line)", borderRadius: 3 }}>
                        <div style={{ width: `${d.reviews.length ? (r.n / d.reviews.length) * 100 : 0}%`, height: "100%", background: "var(--accent)", borderRadius: 3 }} />
                      </div>
                    </div>))}
                  </div>
                </div>
                {d.reviews.map((r) => (
                  <div key={r.id} className="review">
                    <div className="row between"><b className="small">{r.userName}</b><span className="muted small">{fmtDate(r.createdAt)}</span></div>
                    <div className="stars" aria-label={`${r.rating}점`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
                    <div style={{ fontSize: 13.5, marginTop: 4 }}>{r.body}</div>
                    {r.reply && <div className="card small" style={{ marginTop: 8, marginBottom: 0 }}><b>지도자 답글</b><br />{r.reply}</div>}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === "classes" && (
          <div>
            {d.classes.length === 0 && <p className="muted">현재 열린 클래스가 없습니다. 메시지로 문의해보세요.</p>}
            {d.classes.map((c) => (
              <div key={c.id} className="card">
                <b>{c.title}</b>
                <div className="meta">{won(c.price)} · {c.durationMinutes}분 · {c.format === "ONLINE" ? "비대면" : "대면"} · 정원 {c.capacity}명</div>
                {c.description && <p className="small" style={{ margin: "8px 0 0" }}>{c.description}</p>}
                <div style={{ marginTop: 6 }}>
                  {c.schedules.length === 0 && <p className="muted small">예약 가능한 일정이 없습니다.</p>}
                  {c.schedules.map((s) => (
                    <button key={s.id} className="slot" disabled={s.seatsLeft === 0} onClick={() => router.push(`/book/${s.id}`)}>
                      {fmtDateTime(s.startsAt)}{s.seatsLeft === 0 ? " · 마감" : s.seatsLeft <= 2 ? ` · ${s.seatsLeft}자리` : ""}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "messages" && (
          <div>
            <p className="muted small" style={{ marginTop: 0 }}>예약 전 궁금한 점을 지도자에게 물어보세요.</p>
            <textarea className="textarea" placeholder="메시지 입력" maxLength={1000} value={msg} onChange={(e) => setMsg(e.target.value)} />
            {msgErr && <p className="error">{msgErr}</p>}
            <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={!msg.trim() || sending} onClick={sendFirstMessage}>{sending ? "보내는 중…" : "메시지 보내기"}</button>
          </div>
        )}
      </section>
      <BottomNav />
    </main>
  );
}
