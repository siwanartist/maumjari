"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { api } from "@/lib/client";
import { BOOKING_STATUS_LABEL } from "@/lib/constants";
import { fmtDateTime, won } from "@/lib/format";

type B = {
  id: string; status: string; amount: number; startsAt: string; classTitle: string; teacherId: string; teacherName: string;
  format: string; location: string; refundedAmount: number | null; responseDeadline: string | null; cancelReason: string; canReview: boolean;
};
const ACTIVE = ["REQUESTED", "APPROVED"];

export default function Bookings() {
  const [list, setList] = useState<B[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<{ id: string; kind: "cancel" | "review" | "report" } | null>(null);
  const [text, setText] = useState("");
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  const load = useCallback(() => api<{ bookings: B[] }>("/api/bookings").then((d) => setList(d.bookings)).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!open) return;
    setBusy(true); setErr("");
    try {
      if (open.kind === "cancel") {
        const r = await api<{ refunded: number }>(`/api/bookings/${open.id}/cancel`, { body: { reason: text } });
        setFlash(r.refunded > 0 ? `취소되었습니다. ${won(r.refunded)}이 환불됩니다.` : "취소되었습니다.");
      } else if (open.kind === "review") {
        await api("/api/reviews", { body: { bookingId: open.id, rating, body: text } });
        setFlash("후기가 등록되었습니다. 감사합니다!");
      } else {
        await api("/api/reports", { body: { targetType: "BOOKING", targetId: open.id, reason: text } });
        setFlash("신고가 접수되었습니다. 운영진이 확인 후 연락드립니다.");
      }
      setOpen(null); setText(""); setRating(5); await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  const upcoming = (list ?? []).filter((b) => ACTIVE.includes(b.status));
  const past = (list ?? []).filter((b) => !ACTIVE.includes(b.status));

  const Item = (b: B) => {
    const started = new Date(b.startsAt).getTime() <= Date.now();
    return (
      <div key={b.id} id={b.id} className="card">
        <div className="row between">
          <b>{b.classTitle}</b>
          <span className={`badge ${b.status === "APPROVED" ? "solid" : ["REQUESTED"].includes(b.status) ? "warn" : ""}`} style={{ margin: 0 }}>{BOOKING_STATUS_LABEL[b.status] ?? b.status}</span>
        </div>
        <div className="meta"><Link href={`/teachers/${b.teacherId}`}>{b.teacherName}</Link> · {fmtDateTime(b.startsAt)}</div>
        <div className="meta">
          {won(b.amount)}{b.refundedAmount ? ` · 환불 ${won(b.refundedAmount)}` : ""}
          {b.status === "REQUESTED" && b.responseDeadline && ` · ${fmtDateTime(b.responseDeadline)}까지 응답 예정`}
        </div>
        {b.location && <div className="small" style={{ marginTop: 6 }}>{b.format === "ONLINE" ? "접속 안내" : "장소"}: {b.location}</div>}
        {b.cancelReason && <div className="small muted" style={{ marginTop: 4 }}>사유: {b.cancelReason}</div>}
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          {ACTIVE.includes(b.status) && !started && <button className="btn btn-sm btn-ghost" onClick={() => setOpen({ id: b.id, kind: "cancel" })}>예약 취소</button>}
          {b.canReview && <button className="btn btn-sm btn-ghost" onClick={() => setOpen({ id: b.id, kind: "review" })}>후기 쓰기</button>}
          {["COMPLETED", "NO_SHOW_USER", "APPROVED"].includes(b.status) && started && <button className="btn btn-sm btn-danger" onClick={() => setOpen({ id: b.id, kind: "report" })}>문제 신고</button>}
        </div>
      </div>
    );
  };

  return (
    <main className="shell">
      <TopBar title="예약 내역" />
      <section className="pad" style={{ paddingTop: 0 }}>
        {flash && <p className="success">{flash}</p>}
        {err && !open && <p className="error">{err}</p>}
        {!list && !err && <div className="skeleton" />}
        {list && list.length === 0 && (
          <div className="center" style={{ padding: "40px 0" }}>
            <p className="muted">아직 예약 내역이 없습니다.</p>
            <Link href="/" className="btn btn-primary" style={{ display: "inline-block", width: "auto" }}>지도자 찾아보기</Link>
          </div>
        )}
        {upcoming.length > 0 && <><div className="section-title" style={{ margin: "10px 0" }}>다가오는 예약</div>{upcoming.map(Item)}</>}
        {past.length > 0 && <><div className="section-title" style={{ margin: "18px 0 10px" }}>지난 예약</div>{past.map(Item)}</>}
      </section>

      {open && (
        <div className="modal-back" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>{open.kind === "cancel" ? "예약을 취소할까요?" : open.kind === "review" ? "수업 후기" : "문제 신고"}</h3>
            {open.kind === "cancel" && <p className="muted small">승인 전: 전액 환불 · 수업 3일 전까지: 전액 · 1일 전까지: 50% · 이후: 환불 불가</p>}
            {open.kind === "report" && <p className="muted small">지도자가 오지 않았거나 수업에 문제가 있었다면 알려주세요. 확인되면 전액 환불됩니다.</p>}
            {open.kind === "review" && (
              <div className="row" style={{ margin: "6px 0 10px" }} role="radiogroup" aria-label="별점">
                {[1, 2, 3, 4, 5].map((n) => <button key={n} className="link" style={{ fontSize: 26, color: n <= rating ? "var(--dawn)" : "var(--muted)" }} aria-label={`${n}점`} onClick={() => setRating(n)}>★</button>)}
              </div>
            )}
            <textarea className="textarea" maxLength={1000} placeholder={open.kind === "cancel" ? "취소 사유 (선택)" : open.kind === "review" ? "수업은 어떠셨나요? (5자 이상)" : "상황을 자세히 적어주세요 (5자 이상)"} value={text} onChange={(e) => setText(e.target.value)} />
            {err && <p className="error">{err}</p>}
            <button className={`btn ${open.kind === "cancel" ? "btn-danger" : "btn-primary"}`} style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={submit}>
              {open.kind === "cancel" ? "예약 취소하기" : open.kind === "review" ? "후기 등록" : "신고하기"}
            </button>
            <button className="link" style={{ width: "100%", marginTop: 8 }} onClick={() => { setOpen(null); setErr(""); }}>닫기</button>
          </div>
        </div>
      )}
      <BottomNav />
    </main>
  );
}
