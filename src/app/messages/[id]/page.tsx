"use client";
import { useCallback, useEffect, useRef, useState, use } from "react";
import TopBar from "@/components/TopBar";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";

type M = { id: string; body: string; mine: boolean; createdAt: string };

export default function Thread(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [title, setTitle] = useState("");
  const [msgs, setMsgs] = useState<M[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(() => api<{ title: string; messages: M[] }>(`/api/threads/${params.id}/messages`)
    .then((d) => { setTitle(d.title); setMsgs(d.messages); }).catch((e) => setErr(e.message)), [params.id]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000); // 5초 간격 새 메시지 확인
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (msgs.length !== count.current) { count.current = msgs.length; endRef.current?.scrollIntoView(); } }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setErr("");
    try { await api(`/api/threads/${params.id}/messages`, { body: { body: text } }); setText(""); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <main className="shell" style={{ paddingBottom: 90 }}>
      <TopBar title={title || "메시지"} back="/messages" />
      <section className="pad" style={{ paddingTop: 0 }}>
        {msgs.map((m) => (
          <div key={m.id} className={`bubble-wrap ${m.mine ? "mine" : ""}`}>
            <div><div className="bubble">{m.body}</div><div className="muted" style={{ fontSize: 10.5, textAlign: m.mine ? "right" : "left", marginTop: 2 }}>{fmtDateTime(m.createdAt)}</div></div>
          </div>
        ))}
        <div ref={endRef} />
        {err && <p className="error">{err}</p>}
      </section>
      <form onSubmit={send} className="bottomnav" style={{ padding: "10px 12px calc(10px + env(safe-area-inset-bottom, 0px))", gap: 8 }}>
        <input className="input" placeholder="메시지 입력" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="메시지" />
        <button className="btn btn-sm btn-primary" style={{ width: "auto" }} disabled={busy || !text.trim()}>전송</button>
      </form>
    </main>
  );
}
