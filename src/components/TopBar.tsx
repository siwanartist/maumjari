"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { BackIcon, BellIcon } from "./Icons";

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
          <button className="iconbtn" aria-label="뒤로" onClick={() => (typeof back === "string" ? router.push(back) : router.back())}>
            <BackIcon size={24} strokeWidth={2} />
          </button>
        )}
        <span className={`title${title === "마음자리" ? " brand" : ""}`}>{title}</span>
      </div>
      <Link href="/notifications" className="iconbtn" aria-label={unread > 0 ? `알림 ${unread}개 읽지 않음` : "알림"}>
        <BellIcon size={24} />
        {unread > 0 && <span className="dot" aria-hidden>{unread > 99 ? "99+" : unread}</span>}
      </Link>
    </header>
  );
}
