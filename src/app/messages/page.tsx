"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Avatar from "@/components/Avatar";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import SearchBox from "@/components/SearchBox";

type T = { id: string; counterpartName: string; lastMessageAt: string; asTeacher: boolean };

export default function Messages() {
  const [list, setList] = useState<T[] | null>(null);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { api<{ threads: T[] }>("/api/threads").then((d) => setList(d.threads)).catch((e) => setErr(e.message)); }, []);
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  const shown = list?.filter((t) => !q || t.counterpartName.toLowerCase().replace(/\s+/g, "").includes(q));
  return (
    <main className="shell">
      <TopBar title="메시지" />
      {list && list.length > 0 && <SearchBox value={query} onChange={setQuery} placeholder="이름으로 대화 찾기" label="대화 검색" />}
      <section className="pad" style={{ paddingTop: 0 }}>
        {err && <p className="error">{err}</p>}
        {!list && !err && <div className="skeleton" />}
        {list?.length === 0 && <p className="muted">아직 대화가 없습니다. 지도자 프로필의 메시지 탭에서 문의를 시작해보세요.</p>}
        {list && list.length > 0 && shown?.length === 0 && <p className="muted">"{query.trim()}"과 나눈 대화가 없습니다.</p>}
        {shown?.map((t) => (
          <Link key={t.id} href={`/messages/${t.id}`} className="card click">
            <Avatar name={t.counterpartName} />
            <div style={{ flex: 1 }}>
              <b>{t.counterpartName}</b>{t.asTeacher && <span className="badge">수강 문의</span>}
              <div className="meta">{fmtDateTime(t.lastMessageAt)}</div>
            </div>
          </Link>
        ))}
      </section>
      <BottomNav />
    </main>
  );
}
