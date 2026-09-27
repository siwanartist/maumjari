"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";

/** 실제 PG 결제창 성공 후 돌아오는 페이지 — 서버에서 금액 검증 + 최종 승인 */
function Success() {
  const q = useSearchParams();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");
  const called = useRef(false);
  useEffect(() => {
    if (called.current) return; called.current = true;
    api("/api/payments/confirm", { body: { paymentKey: q.get("paymentKey"), orderId: q.get("orderId"), amount: q.get("amount") } })
      .then(() => setState("ok")).catch((e) => { setMsg(e.message); setState("error"); });
  }, [q]);
  return (
    <main className="shell"><div className="status-box">
      {state === "loading" && <><div className="icon">⏳</div><h2>결제를 확인하고 있습니다</h2></>}
      {state === "ok" && <><div className="icon">✓</div><h2>결제 완료 · 지도자 승인 대기 중</h2><p className="muted small">거절되거나 기한 내 응답이 없으면 전액 자동 환불됩니다.</p></>}
      {state === "error" && <><div className="icon">!</div><h2>결제를 완료하지 못했습니다</h2><p className="error">{msg}</p></>}
      <Link href="/bookings" className="btn btn-primary" style={{ display: "block", marginTop: 20 }}>예약 내역 보기</Link>
    </div></main>
  );
}
export default function Page() { return <Suspense><Success /></Suspense>; }
