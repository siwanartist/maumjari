"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export default function TopBar({ title, back }: { title: string; back?: boolean | string }) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    api<{ unread: number }>("/api/notifications").then((d) => setUnread(d.unread)).catch(() => {});
  }, []);
  return (
    <header className="topbar">
      <div className="row">
        {back && (
          <button className="link" aria-label="뒤로" onClick={() => (typeof back === "string" ? router.push(back) : router.back())}>←</button>
        )}
        <span className="title">{title}</span>
      </div>
      <Link href="/notifications" className="link" aria-label={`알림 ${unread}개`}>
        🔔{unread > 0 && <span className="badge solid" style={{ margin: "0 0 0 4px" }}>{unread}</span>}
      </Link>
    </header>
  );
}
