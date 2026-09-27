"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";

type N = { id: string; title: string; body: string; link: string; readAt: string | null; createdAt: string };

export default function Notifications() {
  const [list, setList] = useState<N[] | null>(null);
  useEffect(() => {
    api<{ notifications: N[] }>("/api/notifications").then((d) => {
      setList(d.notifications);
      if (d.notifications.some((n) => !n.readAt)) api("/api/notifications", { method: "POST" }).catch(() => {});
    });
  }, []);
  return (
    <main className="shell">
      <TopBar title="알림" back />
      <section className="pad" style={{ paddingTop: 0 }}>
        {!list && <div className="skeleton" />}
        {list?.length === 0 && <p className="muted">새 알림이 없습니다.</p>}
        {list?.map((n) => (
          <Link key={n.id} href={n.link || "#"} className="card" style={{ display: "block", borderColor: n.readAt ? undefined : "var(--accent)" }}>
            <b className="small">{n.title}</b>
            <div className="small" style={{ marginTop: 2 }}>{n.body}</div>
            <div className="meta small">{fmtDateTime(n.createdAt)}</div>
          </Link>
        ))}
      </section>
      <BottomNav />
    </main>
  );
}
