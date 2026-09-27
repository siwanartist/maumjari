"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function Fail() {
  const msg = useSearchParams().get("message");
  return (
    <main className="shell"><div className="status-box">
      <div className="icon">!</div><h2>결제가 취소되었습니다</h2>
      <p className="muted small">{msg || "결제가 완료되지 않았습니다. 다시 시도해주세요."}</p>
      <Link href="/" className="btn btn-primary" style={{ display: "block", marginTop: 20 }}>홈으로</Link>
    </div></main>
  );
}
export default function Page() { return <Suspense><Fail /></Suspense>; }
