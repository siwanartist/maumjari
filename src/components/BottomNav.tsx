"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", icon: "⌂", label: "홈", match: (p: string) => p === "/" || p.startsWith("/teachers") },
  { href: "/explore", icon: "⌕", label: "탐색", match: (p: string) => p.startsWith("/explore") },
  { href: "/bookings", icon: "▣", label: "예약", match: (p: string) => p.startsWith("/bookings") || p.startsWith("/book") },
  { href: "/messages", icon: "✉", label: "메시지", match: (p: string) => p.startsWith("/messages") },
  { href: "/profile", icon: "◎", label: "프로필", match: (p: string) => p.startsWith("/profile") || p === "/teacher" || p.startsWith("/teacher/") || p.startsWith("/admin") },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottomnav" aria-label="주요 메뉴">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={i.match(path) ? "on" : ""} aria-current={i.match(path) ? "page" : undefined}>
          <span className="nicon" aria-hidden>{i.icon}</span>{i.label}
        </Link>
      ))}
    </nav>
  );
}
