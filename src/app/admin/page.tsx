"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import { api } from "@/lib/client";
import { BOOKING_STATUS_LABEL } from "@/lib/constants";
import { fmtDateTime, fmtDate, won } from "@/lib/format";

const TABS = [["overview", "현황"], ["teachers", "지도자 심사"], ["reports", "신고"], ["settlements", "정산"]] as const;

export default function Admin() {
  const router = useRouter();
  const [tab, setTab] = useState<string>("overview");
  const [ok, setOk] = useState(false);
  useEffect(() => {
    api<{ user: { role: string } | null }>("/api/me").then((d) => { if (d.user?.role !== "ADMIN") router.replace("/"); else setOk(true); });
  }, [router]);
  if (!ok) return null;
  return (
    <main className="shell wide">
      <TopBar title="운영 관리 콘솔" back="/profile" />
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "sel" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      <section className="pad">
        {tab === "overview" && <Overview />}
        {tab === "teachers" && <Teachers />}
        {tab === "reports" && <Reports />}
        {tab === "settlements" && <Settlements />}
      </section>
    </main>
  );
}

function Overview() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api("/api/admin/overview").then(setD); }, []);
  if (!d) return <div className="skeleton" />;
  const stats = [
    ["가입자", `${d.users}명`], ["심사 대기 지도자", `${d.teachersPending}명`], ["활동 지도자", `${d.teachersApproved}명`],
    ["승인 대기 예약", `${d.bookings.awaiting}건`], ["확정·완료 예약", `${d.bookings.confirmed}건`], ["미처리 신고", `${d.openReports}건`],
    ["총 결제액", won(d.gross)], ["총 환불액", won(d.refunded)], ["플랫폼 수수료", won(d.platformFees)], ["지급 예정 정산", won(d.settlementPending)],
  ];
  return (
    <div>
      <div className="stat-grid">{stats.map(([k, v]) => <div key={k} className="stat"><span className="muted small">{k}</span><b>{v}</b></div>)}</div>
      <h3 style={{ fontSize: 15, marginTop: 24 }}>최근 결제</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>일시</th><th>주문번호</th><th>수강생</th><th>클래스</th><th>금액</th><th>환불</th><th>결제</th><th>예약</th></tr></thead>
        <tbody>{d.recentPayments.map((p: any) => (
          <tr key={p.orderId}><td>{fmtDateTime(p.createdAt)}</td><td>{p.orderId}</td><td>{p.userName}</td><td>{p.classTitle}</td><td>{won(p.amount)}</td>
            <td>{p.refundedAmount ? won(p.refundedAmount) : "-"}</td><td>{p.status}</td><td>{BOOKING_STATUS_LABEL[p.bookingStatus]}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function Teachers() {
  const [status, setStatus] = useState("PENDING");
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api<{ teachers: any[] }>(`/api/admin/teachers?status=${status}`).then((d) => setList(d.teachers)), [status]);
  useEffect(() => { setList(null); load(); }, [load]);
  async function act(id: string, action: string) {
    let reason = "";
    if (action === "reject" || action === "suspend") { reason = prompt("사유를 입력하세요 (지도자에게 전달됩니다)") ?? ""; if (!reason) return; }
    setErr("");
    try { await api(`/api/admin/teachers/${id}`, { body: { action, reason } }); await load(); } catch (e: any) { setErr(e.message); }
  }
  return (
    <div>
      {[["PENDING", "심사 대기"], ["APPROVED", "승인"], ["REJECTED", "반려"], ["SUSPENDED", "정지"]].map(([k, l]) =>
        <button key={k} className={`chip ${status === k ? "sel" : ""}`} onClick={() => setStatus(k)}>{l}</button>)}
      {err && <p className="error">{err}</p>}
      {!list && <div className="skeleton" />}
      {list?.length === 0 && <p className="muted">해당하는 지도자가 없습니다.</p>}
      {list?.map((t) => (
        <div key={t.id} className="card">
          <div className="row between"><b>{t.displayName}</b><span className="muted small">{t.email} · 신청 {fmtDate(t.createdAt)}</span></div>
          <p className="small" style={{ whiteSpace: "pre-wrap" }}>{t.bio}</p>
          <p className="small"><b>경력·자격:</b> {t.certification || "-"}</p>
          {t.certProofUrl && <a className="btn-text small" href={t.certProofUrl} target="_blank" rel="noopener noreferrer">증빙 자료 열기 ↗</a>}
          <div>{t.tags.map((x: string) => <span key={x} className="badge">#{x}</span>)}</div>
          <div className="muted small" style={{ marginTop: 6 }}>지역 {t.region || "-"} · 페널티 {t.penaltyCount} · 인증배지 {t.verified ? "O" : "X"}</div>
          <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
            {t.status !== "APPROVED" && <button className="btn btn-sm btn-primary" style={{ width: "auto" }} onClick={() => act(t.id, "approve")}>승인</button>}
            {t.status === "PENDING" && <button className="btn btn-sm btn-danger" onClick={() => act(t.id, "reject")}>반려</button>}
            {t.status === "APPROVED" && <button className="btn btn-sm btn-danger" onClick={() => act(t.id, "suspend")}>활동 정지</button>}
            <button className="btn btn-sm btn-ghost" onClick={() => act(t.id, t.verified ? "unverify" : "verify")}>{t.verified ? "인증배지 해제" : "인증배지 부여"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Reports() {
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api<{ reports: any[] }>("/api/admin/reports").then((d) => setList(d.reports)), []);
  useEffect(() => { load(); }, [load]);
  async function act(r: any, action: "resolve" | "dismiss", extra: Record<string, boolean> = {}) {
    const note = prompt("처리 메모 (선택)") ?? "";
    setErr("");
    try { await api(`/api/admin/reports/${r.id}`, { body: { action, note, ...extra } }); await load(); } catch (e: any) { setErr(e.message); }
  }
  if (!list) return <div className="skeleton" />;
  return (
    <div>
      {err && <p className="error">{err}</p>}
      {list.length === 0 && <p className="muted">접수된 신고가 없습니다.</p>}
      {list.map((r) => (
        <div key={r.id} className="card">
          <div className="row between"><b className="small">{r.targetType} · {r.targetId.slice(0, 8)}</b><span className="badge" style={{ margin: 0 }}>{r.status}</span></div>
          <p className="small" style={{ whiteSpace: "pre-wrap" }}>{r.reason}</p>
          <div className="muted small">신고자 {r.reporterName} ({r.reporterEmail}) · {fmtDateTime(r.createdAt)}</div>
          {r.adminNote && <div className="small">메모: {r.adminNote}</div>}
          {r.status === "OPEN" && (
            <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              {r.targetType === "BOOKING" && <button className="btn btn-sm btn-danger" onClick={() => confirm("지도자 불참을 확정하고 수강생에게 전액 환불할까요?") && act(r, "resolve", { confirmTeacherNoShow: true })}>지도자 불참 확정 · 전액 환불</button>}
              {r.targetType === "REVIEW" && <button className="btn btn-sm btn-danger" onClick={() => act(r, "resolve", { hideReview: true })}>후기 숨김</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => act(r, "resolve")}>처리 완료</button>
              <button className="btn btn-sm btn-ghost" onClick={() => act(r, "dismiss")}>기각</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Settlements() {
  const [list, setList] = useState<any[] | null>(null);
  const load = useCallback(() => api<{ settlements: any[] }>("/api/admin/settlements").then((d) => setList(d.settlements)), []);
  useEffect(() => { load(); }, [load]);
  if (!list) return <div className="skeleton" />;
  return (
    <div>
      <p className="muted small">1차 운영: 지도자 계좌로 이체한 뒤 &lsquo;지급 완료&rsquo;를 눌러 기록합니다.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>생성일</th><th>지도자</th><th>결제</th><th>수수료</th><th>지급액</th><th>상태</th><th></th></tr></thead>
        <tbody>{list.map((s) => (
          <tr key={s.id}><td>{fmtDate(s.createdAt)}</td><td>{s.teacherName}</td><td>{won(s.grossAmount)}</td><td>{won(s.feeAmount)}</td><td>{won(s.netAmount)}</td>
            <td>{s.status === "PAID" ? `지급 ${fmtDate(s.paidAt)}` : "예정"}</td>
            <td>{s.status === "PENDING" && <button className="btn btn-sm btn-ghost" onClick={async () => { if (confirm(`${s.teacherName}님에게 ${won(s.netAmount)} 지급 완료로 기록할까요?`)) { await api(`/api/admin/settlements/${s.id}`, { method: "POST" }); load(); } }}>지급 완료</button>}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
