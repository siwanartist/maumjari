"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, loadPendingPrefs } from "@/lib/client";

/** 소셜 로그인 직후 거쳐 가는 화면: 로그인 전에 한 취향 진단 결과가 있으면 계정에 저장하고 원래 가려던 곳으로 */
function Complete() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  useEffect(() => {
    (async () => {
      const prefs = loadPendingPrefs();
      if (prefs) await api("/api/preferences", { method: "PUT", body: prefs }).catch(() => {});
      router.replace(next.startsWith("/") ? next : "/"); router.refresh();
    })();
  }, [next, router]);
  return <main className="shell"><div className="pad"><div className="skeleton" /><p className="muted small center">로그인 중…</p></div></main>;
}
export default function CompletePage() { return <Suspense><Complete /></Suspense>; }
