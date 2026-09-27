"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, SearchIcon, CalendarIcon, ChatIcon, UserIcon } from "./Icons";

const items = [
  { href: "/", Icon: HomeIcon, label: "홈", match: (p: string) => p === "/" || p.startsWith("/teachers") },
  { href: "/explore", Icon: SearchIcon, label: "탐색", match: (p: string) => p.startsWith("/explore") },
  { href: "/bookings", Icon: CalendarIcon, label: "예약", match: (p: string) => p.startsWith("/bookings") || p.startsWith("/book") },
  { href: "/messages", Icon: ChatIcon, label: "메시지", match: (p: string) => p.startsWith("/messages") },
  { href: "/profile", Icon: UserIcon, label: "프로필", match: (p: string) => p.startsWith("/profile") || p === "/teacher" || p.startsWith("/teacher/") || p.startsWith("/admin") },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottomnav" aria-label="주요 메뉴">
      {items.map(({ href, Icon, label, match }) => {
        const on = match(path);
        return (
          <Link key={href} href={href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
            <span className="nicon" aria-hidden><Icon size={24} strokeWidth={on ? 2.4 : 1.7} /></span>{label}
          </Link>
        );
      })}
    </nav>
  );
}
