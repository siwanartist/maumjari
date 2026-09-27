"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import TeacherProfileForm, { type TeacherForm } from "@/components/TeacherProfileForm";
import { api } from "@/lib/client";
import { BOOKING_STATUS_LABEL } from "@/lib/constants";
import { fmtDateTime, fmtDate, won } from "@/lib/format";

type Teacher = TeacherForm & { id: string; status: string; rejectReason: string; verified: boolean };
type Bk = { id: string; status: string; amount: number; responseDeadline: string | null; startsAt: string; endsAt: string; classTitle: string; studentName: string; cancelReason: string };
type Sch = { id: string; startsAt: string; isCanceled: boolean };
type Cls = { id: string; title: string; description: string; format: "OFFLINE" | "ONLINE"; location: string; capacity: number; price: number; durationMinutes: number; bookingCutoffHours: number; isPublished: boolean; schedules: Sch[] };
type St = { id: string; netAmount: number; feeAmount: number; grossAmount: number; status: string; classTitle: string; startsAt: string; createdAt: string };
type Rv = { id: string; rating: number; body: string; reply: string; userName: string; createdAt: string };

const TABS = [["bookings", "예약"], ["classes", "클래스"], ["reviews", "후기"], ["settlements", "정산"], ["profile", "프로필"]] as const;
const STATUS_MSG: Record<string, string> = {
  PENDING: "운영진이 프로필을 심사 중입니다. 승인 전에도 클래스를 미리 만들어둘 수 있어요.",
  REJECTED: "심사가 반려되었습니다. 프로필을 수정해 저장하면 다시 심사합니다.",
  SUSPENDED: "활동이 정지된 상태입니다. 운영진에게 문의해주세요.",
};

export default function TeacherCenter() {
  const router = useRouter();
  const [t, setT] = useState<Teacher | null>(null);
  const [tab, setTab] = useState<string>("bookings");
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ teacher: Teacher }>("/api/teacher/profile").then((d) => setT(d.teacher)).catch((e) => {
      if (e.status === 403) router.replace("/teacher/apply"); else setErr(e.message);
    });
  }, [router]);

  if (err) return <main className="shell"><p className="pad error">{err}</p></main>;
  if (!t) return <main className="shell"><div className="pad"><div className="skeleton" /></div></main>;

  return (
    <main className="shell">
      <TopBar title="지도자센터" back="/profile" />
      <div className="pad" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {STATUS_MSG[t.status] && <div className="card small" style={{ borderColor: "var(--warn)" }}>{STATUS_MSG[t.status]}{t.rejectReason && <><br />사유: {t.rejectReason}</>}</div>}
        {t.status === "APPROVED" && <Link href={`/teachers/${t.id}`} className="btn-text small">내 공개 프로필 보기 →</Link>}
      </div>
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "sel" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      <section className="pad">
        {tab === "bookings" && <BookingsTab approved={t.status === "APPROVED"} />}
        {tab === "classes" && <ClassesTab />}
        {tab === "reviews" && <ReviewsTab />}
        {tab === "settlements" && <SettlementsTab />}
        {tab === "profile" && (
          <TeacherProfileForm initial={t} submitLabel={t.status === "REJECTED" ? "수정 후 재심사 요청" : "프로필 저장"} onSubmit={async (f) => {
            const r = await api<{ status: string }>("/api/teacher/profile", { method: "PATCH", body: f });
            setT({ ...t, ...f, status: r.status }); alert("저장되었습니다.");
          }} />
        )}
      </section>
      <BottomNav />
    </main>
  );
}

function ReasonModal({ title, required, onClose, onSubmit }: { title: string; required?: boolean; onClose: () => void; onSubmit: (r: string) => Promise<void> }) {
  const [r, setR] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  return (
    <div className="modal-back" role="dialog" aria-modal="true"><div className="modal">
      <h3>{title}</h3>
      <textarea className="textarea" placeholder={required ? "사유 (필수, 수강생에게 전달됩니다)" : "사유 (선택, 수강생에게 전달됩니다)"} value={r} onChange={(e) => setR(e.target.value)} />
      {err && <p className="error">{err}</p>}
      <button className="btn btn-danger" style={{ width: "100%", marginTop: 12 }} disabled={busy || (required && !r.trim())}
        onClick={async () => { setBusy(true); try { await onSubmit(r); } catch (e: any) { setErr(e.message); setBusy(false); } }}>확인</button>
      <button className="link" style={{ width: "100%", marginTop: 8 }} onClick={onClose}>닫기</button>
    </div></div>
  );
}

function BookingsTab({ approved }: { approved: boolean }) {
  const [list, setList] = useState<Bk[] | null>(null);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState<{ id: string; action: "reject" | "cancel" } | null>(null);
  const load = useCallback(() => api<{ bookings: Bk[] }>("/api/teacher/bookings").then((d) => setList(d.bookings)).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: string, reason = "") {
    setErr("");
    try { await api(`/api/teacher/bookings/${id}`, { body: { action, reason } }); setModal(null); await load(); }
    catch (e: any) { if (modal) throw e; setErr(e.message); }
  }
  if (!list) return err ? <p className="error">{err}</p> : <div className="skeleton" />;
  const now = Date.now();
  const requested = list.filter((b) => b.status === "REQUESTED");
  const upcoming = list.filter((b) => b.status === "APPROVED" && new Date(b.startsAt).getTime() > now);
  const toMark = list.filter((b) => b.status === "APPROVED" && new Date(b.startsAt).getTime() <= now);
  const history = list.filter((b) => !["REQUESTED", "APPROVED"].includes(b.status));

  const head = (b: Bk) => (<><div className="row between"><b>{b.classTitle}</b><span className="badge" style={{ margin: 0 }}>{BOOKING_STATUS_LABEL[b.status]}</span></div>
    <div className="meta">{b.studentName} · {fmtDateTime(b.startsAt)} · {won(b.amount)}</div></>);

  return (
    <div>
      {err && <p className="error">{err}</p>}
      {!approved && <p className="muted small">심사 승인 후 예약을 받을 수 있습니다.</p>}
      <h3 style={{ fontSize: 15 }}>승인 대기 ({requested.length})</h3>
      {requested.length === 0 && <p className="muted small">새 예약 요청이 없습니다.</p>}
      {requested.map((b) => (
        <div key={b.id} className="card">{head(b)}
          {b.responseDeadline && <div className="small" style={{ color: "var(--warn)", marginTop: 4 }}>{fmtDateTime(b.responseDeadline)}까지 응답하지 않으면 자동 취소·환불됩니다</div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-sm btn-primary" style={{ width: "auto" }} onClick={() => act(b.id, "approve")}>승인</button>
            <button className="btn btn-sm btn-danger" onClick={() => setModal({ id: b.id, action: "reject" })}>거절</button>
          </div>
        </div>
      ))}
      <h3 style={{ fontSize: 15, marginTop: 22 }}>확정된 예정 수업 ({upcoming.length})</h3>
      {upcoming.map((b) => (
        <div key={b.id} className="card">{head(b)}
          <button className="btn btn-sm btn-danger" style={{ marginTop: 10 }} onClick={() => setModal({ id: b.id, action: "cancel" })}>수업 취소 (전액 환불 · 페널티)</button>
        </div>
      ))}
      {toMark.length > 0 && <h3 style={{ fontSize: 15, marginTop: 22 }}>수업 결과 입력 ({toMark.length})</h3>}
      {toMark.map((b) => (
        <div key={b.id} className="card">{head(b)}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-sm btn-primary" style={{ width: "auto" }} disabled={new Date(b.endsAt).getTime() > now} onClick={() => act(b.id, "complete")}>수업 완료</button>
            <button className="btn btn-sm btn-ghost" onClick={() => act(b.id, "noshow")}>수강생 불참</button>
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>수업 종료 48시간 후 자동으로 완료 처리됩니다.</div>
        </div>
      ))}
      {history.length > 0 && <h3 style={{ fontSize: 15, marginTop: 22 }}>지난 내역</h3>}
      {history.slice(0, 30).map((b) => <div key={b.id} className="card">{head(b)}{b.cancelReason && <div className="muted small">사유: {b.cancelReason}</div>}</div>)}
      {modal && <ReasonModal title={modal.action === "reject" ? "예약 요청을 거절할까요? (전액 환불)" : "확정된 수업을 취소할까요? (전액 환불 · 페널티)"}
        required={modal.action === "cancel"} onClose={() => setModal(null)} onSubmit={(r) => act(modal.id, modal.action, r)} />}
    </div>
  );
}

const emptyClass = { title: "", description: "", format: "OFFLINE" as const, location: "", capacity: 1, price: 30000, durationMinutes: 60, bookingCutoffHours: 3, isPublished: true };

function ClassesTab() {
  const [list, setList] = useState<Cls[] | null>(null);
  const [form, setForm] = useState<typeof emptyClass | null>(null);
  const [err, setErr] = useState("");
  const [schedFor, setSchedFor] = useState<string | null>(null);
  const load = useCallback(() => api<{ classes: Cls[] }>("/api/teacher/classes").then((d) => setList(d.classes)).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setErr("");
    try { await api("/api/teacher/classes", { body: form }); setForm(null); await load(); } catch (e: any) { setErr(e.message); }
  }
  async function togglePublish(c: Cls) {
    await api(`/api/teacher/classes/${c.id}`, { method: "PATCH", body: { isPublished: !c.isPublished } }).catch((e) => setErr(e.message));
    await load();
  }
  async function closeSchedule(id: string) {
    setErr("");
    try { await api(`/api/teacher/schedules/${id}`, { method: "DELETE" }); await load(); } catch (e: any) { setErr(e.message); }
  }

  return (
    <div>
      {err && <p className="error">{err}</p>}
      {!form && <button className="btn btn-primary" onClick={() => setForm({ ...emptyClass })}>+ 새 클래스 만들기</button>}
      {form && (
        <div className="card">
          <h3 style={{ fontSize: 15 }}>새 클래스</h3>
          <label className="label">클래스명</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label className="label">소개</label><textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <label className="label">진행 방식</label>
          {(["OFFLINE", "ONLINE"] as const).map((f) => <button type="button" key={f} className={`chip ${form.format === f ? "sel" : ""}`} onClick={() => setForm({ ...form, format: f as any })}>{f === "OFFLINE" ? "대면" : "비대면"}</button>)}
          <label className="label">{form.format === "OFFLINE" ? "장소 (확정된 수강생에게만 공개)" : "화상 접속 안내 (확정된 수강생에게만 공개)"}</label>
          <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}><label className="label">가격(원)</label><input className="input" type="number" min={1000} step={1000} value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} /></div>
            <div style={{ flex: 1 }}><label className="label">정원</label><input className="input" type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: +e.target.value })} /></div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}><label className="label">소요 시간(분)</label><input className="input" type="number" min={10} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: +e.target.value })} /></div>
            <div style={{ flex: 1 }}><label className="label">예약 마감(시작 N시간 전)</label><input className="input" type="number" min={0} value={form.bookingCutoffHours} onChange={(e) => setForm({ ...form, bookingCutoffHours: +e.target.value })} /></div>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-sm btn-primary" style={{ width: "auto" }} onClick={create}>만들기</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setForm(null)}>취소</button>
          </div>
        </div>
      )}
      {!list && <div className="skeleton" />}
      {list?.map((c) => (
        <div key={c.id} className="card" style={{ marginTop: 12 }}>
          <div className="row between"><b>{c.title}</b><span className={`badge ${c.isPublished ? "solid" : ""}`} style={{ margin: 0 }}>{c.isPublished ? "공개" : "비공개"}</span></div>
          <div className="meta">{won(c.price)} · {c.durationMinutes}분 · {c.format === "ONLINE" ? "비대면" : "대면"} · 정원 {c.capacity}</div>
          <div style={{ marginTop: 6 }}>
            {c.schedules.filter((s) => !s.isCanceled).map((s) => (
              <span key={s.id} className="slot">{fmtDateTime(s.startsAt)} <button className="link small" aria-label="일정 닫기" onClick={() => closeSchedule(s.id)}>✕</button></span>
            ))}
            {c.schedules.filter((s) => !s.isCanceled).length === 0 && <p className="muted small">예정된 일정이 없습니다.</p>}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setSchedFor(schedFor === c.id ? null : c.id)}>+ 일정 추가</button>
            <button className="btn btn-sm btn-ghost" onClick={() => togglePublish(c)}>{c.isPublished ? "비공개로" : "공개로"}</button>
          </div>
          {schedFor === c.id && <ScheduleForm classId={c.id} onDone={() => { setSchedFor(null); load(); }} />}
        </div>
      ))}
    </div>
  );
}

function ScheduleForm({ classId, onDone }: { classId: string; onDone: () => void }) {
  const [mode, setMode] = useState<"once" | "weekly">("once");
  const [dt, setDt] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [time, setTime] = useState("19:00");
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [weeks, setWeeks] = useState(4);
  const [err, setErr] = useState("");
  async function submit() {
    setErr("");
    const body = mode === "once"
      ? { mode, startsAt: [new Date(`${dt}:00+09:00`).toISOString()] } // 입력값은 한국시간 기준
      : { mode, weekdays, time, fromDate, weeks };
    try { const r = await api<{ added: number }>(`/api/teacher/classes/${classId}/schedules`, { body }); alert(`${r.added}개 일정이 추가되었습니다.`); onDone(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <button type="button" className={`chip ${mode === "once" ? "sel" : ""}`} onClick={() => setMode("once")}>한 번</button>
      <button type="button" className={`chip ${mode === "weekly" ? "sel" : ""}`} onClick={() => setMode("weekly")}>매주 반복</button>
      {mode === "once" ? (
        <><label className="label">일시 (한국시간)</label><input className="input" type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} /></>
      ) : (
        <>
          <label className="label">요일</label>
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <button type="button" key={d} className={`chip ${weekdays.includes(i) ? "sel" : ""}`} onClick={() => setWeekdays(weekdays.includes(i) ? weekdays.filter((x) => x !== i) : [...weekdays, i])}>{d}</button>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}><label className="label">시작 시각</label><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="label">시작일</label><input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
            <div style={{ width: 80 }}><label className="label">주 수</label><input className="input" type="number" min={1} max={12} value={weeks} onChange={(e) => setWeeks(+e.target.value)} /></div>
          </div>
        </>
      )}
      {err && <p className="error">{err}</p>}
      <button className="btn btn-sm btn-primary" style={{ width: "auto", marginTop: 10 }} disabled={mode === "once" ? !dt : weekdays.length === 0} onClick={submit}>일정 추가</button>
    </div>
  );
}

function ReviewsTab() {
  const [list, setList] = useState<Rv[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const load = useCallback(() => api<{ reviews: Rv[] }>("/api/teacher/reviews").then((d) => setList(d.reviews)), []);
  useEffect(() => { load(); }, [load]);
  if (!list) return <div className="skeleton" />;
  if (list.length === 0) return <p className="muted">아직 후기가 없습니다.</p>;
  return (
    <div>{list.map((r) => (
      <div key={r.id} className="card">
        <div className="row between"><b className="small">{r.userName}</b><span className="muted small">{fmtDate(r.createdAt)}</span></div>
        <div className="stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
        <p className="small" style={{ margin: "4px 0" }}>{r.body}</p>
        <textarea className="textarea" style={{ minHeight: 56 }} placeholder="답글 작성" defaultValue={r.reply} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} />
        <button className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={async () => { await api(`/api/reviews/${r.id}/reply`, { body: { reply: drafts[r.id] ?? r.reply } }); load(); }}>답글 저장</button>
      </div>
    ))}</div>
  );
}

function SettlementsTab() {
  const [d, setD] = useState<{ settlements: St[]; summary: { pending: number; paid: number } } | null>(null);
  useEffect(() => { api("/api/teacher/settlements").then(setD); }, []);
  if (!d) return <div className="skeleton" />;
  return (
    <div>
      <div className="stat-grid">
        <div className="stat"><span className="muted small">정산 예정</span><b>{won(d.summary.pending)}</b></div>
        <div className="stat"><span className="muted small">지급 완료</span><b>{won(d.summary.paid)}</b></div>
      </div>
      <p className="muted small">수업 완료(또는 수강생 불참) 처리된 예약이 정산 대상이며, 플랫폼 수수료를 제외한 금액이 지급됩니다.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>수업</th><th>일시</th><th>결제</th><th>수수료</th><th>지급액</th><th>상태</th></tr></thead>
        <tbody>{d.settlements.map((s) => (
          <tr key={s.id}><td>{s.classTitle}</td><td>{fmtDate(s.startsAt)}</td><td>{won(s.grossAmount)}</td><td>{won(s.feeAmount)}</td><td>{won(s.netAmount)}</td><td>{s.status === "PAID" ? "지급완료" : "예정"}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
