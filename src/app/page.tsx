"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import TeacherList from "@/components/TeacherList";
import { api, loadPendingPrefs } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    api<{ user: unknown; preference: unknown }>("/api/me").then((d) => {
      // 첫 방문(취향 진단 전)이면 온보딩으로
      if ((d.user && !d.preference) || (!d.user && !loadPendingPrefs())) { router.replace("/onboarding"); return; }
      setLoggedIn(!!d.user);
      setReady(true);
    }).catch(() => setReady(true));
  }, [router]);

  if (!ready) return <main className="shell"><div className="pad">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div></main>;
  return (
    <main className="shell">
      <TopBar title="Anan" />
      {!loggedIn && (
        <div className="pad" style={{ paddingTop: 0 }}>
          <div className="card row between"><span className="small">가입하면 예약·메시지를 이용할 수 있어요.</span><Link href="/signup" className="btn btn-sm btn-ghost">회원가입</Link></div>
        </div>
      )}
      <TeacherList mode="home" />
      <BottomNav />
    </main>
  );
}
