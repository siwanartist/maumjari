"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { api } from "@/lib/client";
import { fmtDateTime, won } from "@/lib/format";

type Summary = { schedule: { id: string; startsAt: string; classTitle: string; format: string; price: number; durationMinutes: number; teacherName: string; teacherId: string }; policy: string[] };
type Checkout = { bookingId: string; orderId: string; amount: number; checkout: Record<string, unknown> & { provider?: string } };

export default function BookPage({ params }: { params: { scheduleId: string } }) {
  const router = useRouter();
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState("");
  const [method, setMethod] = useState("card");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<Checkout | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { api<Summary>(`/api/schedules/${params.scheduleId}`).then(setS).catch((e) => setErr(e.message)); }, [params.scheduleId]);

  async function startPayment() {
    setBusy(true); setErr("");
    try {
      const o = await api<Checkout>("/api/bookings", { body: { scheduleId: params.scheduleId } });
      if (o.checkout.provider === "mock") { setOrder(o); setBusy(false); return; }
      // ───────────────────────────────────────────────────────────────
      // 실제 PG 연동 지점: PG사 결제창 SDK를 여기서 호출한다.
      //   성공 시 PG가 /book/success?paymentKey=...&orderId=...&amount=... 로 이동
      //   실패 시 /book/fail?message=... 로 이동
      // (docs/PAYMENT_INTEGRATION.md 참고)
      // ───────────────────────────────────────────────────────────────
      throw new Error("결제 모듈이 아직 연결되지 않았습니다.");
    } catch (e: any) {
      if (e.status === 401) { router.push(`/login?next=/book/${params.scheduleId}`); return; }
      setErr(e.message); setBusy(false);
    }
  }

  async function mockConfirm(success: boolean) {
    if (!order) return;
    setBusy(true); setErr("");
    try {
      await api("/api/payments/confirm", { body: { orderId: order.orderId, amount: order.amount, paymentKey: `${success ? "mock" : "mock_fail"}_${order.orderId}` } });
      setOrder(null); setDone(true);
    } catch (e: any) { setOrder(null); setErr(e.message); setBusy(false); }
  }

  if (done) return (
    <main className="shell">
      <div className="status-box">
        <div className="icon">⏳</div>
        <h2>지도자 승인 대기 중</h2>
        <p className="muted small">결제가 완료되었습니다. 지도자가 예약을 승인하면 확정 알림을 보내드려요.<br />거절되거나 기한 내 응답이 없으면 전액 자동 환불됩니다.</p>
        <Link href="/bookings" className="btn btn-primary" style={{ display: "block", marginTop: 20 }}>예약 내역 보기</Link>
      </div>
    </main>
  );

  return (
    <main className="shell">
      <TopBar title="예약 및 결제" back />
      <section className="pad">
        {!s && !err && <div className="skeleton" />}
        {s && (
          <div className="card">
            <div className="summary-row"><span>지도자</span><b>{s.schedule.teacherName}</b></div>
            <div className="summary-row"><span>클래스</span><b>{s.schedule.classTitle}</b></div>
            <div className="summary-row"><span>일시</span><b>{fmtDateTime(s.schedule.startsAt)} ({s.schedule.durationMinutes}분)</b></div>
            <div className="summary-row"><span>진행</span><b>{s.schedule.format === "ONLINE" ? "비대면 (확정 후 접속 안내)" : "대면 (확정 후 장소 안내)"}</b></div>
            <div className="summary-row" style={{ marginBottom: 0 }}><span>결제 금액</span><b>{won(s.schedule.price)}</b></div>
          </div>
        )}
        {s && (
          <>
            <div className="label">결제 수단</div>
            {[["card", "💳 신용/체크카드"], ["easy", "⚡ 간편결제"]].map(([k, l]) => (
              <label key={k} className="card row" style={{ cursor: "pointer", borderColor: method === k ? "var(--accent)" : undefined, marginBottom: 8 }}>
                <input type="radio" name="method" checked={method === k} onChange={() => setMethod(k)} /> {l}
              </label>
            ))}
            <div className="label">취소 · 환불 규정</div>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{s.policy.map((p) => <li key={p}>{p}</li>)}</ul>
            <label className="row small" style={{ marginTop: 14, alignItems: "flex-start" }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
              <span>예약 내용과 취소·환불 규정을 확인했으며 결제에 동의합니다.</span>
            </label>
          </>
        )}
        {err && <p className="error">{err}</p>}
        {s && <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={!agree || busy} onClick={startPayment}>{busy ? "처리 중…" : `${won(s.schedule.price)} 결제하기`}</button>}
      </section>

      {order && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="테스트 결제창">
          <div className="modal">
            <h3>테스트 결제창</h3>
            <p className="muted small">현재 결제 모듈이 테스트 모드(mock)입니다. 실제 돈은 결제되지 않습니다.</p>
            <div className="summary-row"><span>주문번호</span><b className="small">{order.orderId}</b></div>
            <div className="summary-row"><span>금액</span><b>{won(order.amount)}</b></div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy} onClick={() => mockConfirm(true)}>결제 승인</button>
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} disabled={busy} onClick={() => mockConfirm(false)}>결제 실패 시뮬레이션</button>
            <button className="link" style={{ width: "100%", marginTop: 8 }} onClick={() => { setOrder(null); setBusy(false); }}>결제창 닫기</button>
          </div>
        </div>
      )}
    </main>
  );
}
