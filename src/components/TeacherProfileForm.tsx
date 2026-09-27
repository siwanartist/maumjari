"use client";
import { useState } from "react";
import { MOTIVES, TYPES, LEVELS, TIMES } from "@/lib/constants";

export type TeacherForm = {
  displayName: string; tagline: string; bio: string; certification: string; certProofUrl: string;
  profileImageUrl: string; coverImageUrl: string; region: string; latitude: number | null; longitude: number | null; tags: string[];
};
export const emptyTeacherForm: TeacherForm = {
  displayName: "", tagline: "", bio: "", certification: "", certProofUrl: "", profileImageUrl: "", coverImageUrl: "",
  region: "", latitude: null, longitude: null, tags: [],
};
const TAG_GROUPS = [["도움을 줄 수 있는 계기", MOTIVES], ["지도하는 명상 유형", TYPES], ["대상 수준", LEVELS], ["주로 진행하는 시간대", TIMES]] as const;

export default function TeacherProfileForm({ initial, submitLabel, onSubmit }: {
  initial: TeacherForm; submitLabel: string; onSubmit: (f: TeacherForm) => Promise<void>;
}) {
  const [f, setF] = useState<TeacherForm>(initial);
  const [extra, setExtra] = useState(initial.tags.filter((t) => !TAG_GROUPS.some(([, g]) => (g as readonly string[]).includes(t))).join(", "));
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [locMsg, setLocMsg] = useState("");
  const set = (k: keyof TeacherForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const toggle = (t: string) => setF({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] });

  function useMyLocation() {
    setLocMsg("위치 확인 중…");
    navigator.geolocation?.getCurrentPosition(
      (p) => { setF((prev) => ({ ...prev, latitude: +p.coords.latitude.toFixed(4), longitude: +p.coords.longitude.toFixed(4) })); setLocMsg("활동 위치가 등록되었습니다. (거리순 정렬에 사용)"); },
      () => setLocMsg("위치 권한이 필요합니다."),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const known = f.tags.filter((t) => TAG_GROUPS.some(([, g]) => (g as readonly string[]).includes(t)));
    const custom = extra.split(",").map((s) => s.trim()).filter(Boolean);
    try { await onSubmit({ ...f, tags: Array.from(new Set([...known, ...custom])) }); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
      <label className="label">활동명 *</label>
      <input className="input" required maxLength={20} value={f.displayName} onChange={set("displayName")} />
      <label className="label">한 줄 소개</label>
      <input className="input" maxLength={60} placeholder="예: 처음 시작하는 마음챙김" value={f.tagline} onChange={set("tagline")} />
      <label className="label">소개글 * (20자 이상)</label>
      <textarea className="textarea" rows={5} maxLength={2000} value={f.bio} onChange={set("bio")} />
      <label className="label">경력 · 자격</label>
      <textarea className="textarea" maxLength={1000} placeholder="수료 과정, 자격증, 지도 경력 등" value={f.certification} onChange={set("certification")} />
      <label className="label">증빙 자료 링크 (심사용, https://)</label>
      <input className="input" placeholder="자격증 사본 등을 올린 링크" value={f.certProofUrl} onChange={set("certProofUrl")} />
      <label className="label">프로필 사진 링크 (https://)</label>
      <input className="input" value={f.profileImageUrl} onChange={set("profileImageUrl")} />
      <label className="label">배경 사진 링크 (https://)</label>
      <input className="input" value={f.coverImageUrl} onChange={set("coverImageUrl")} />
      <label className="label">활동 지역</label>
      <input className="input" maxLength={40} placeholder="예: 강남구 / 온라인" value={f.region} onChange={set("region")} />
      <button type="button" className="btn-text small" onClick={useMyLocation}>현재 위치를 활동 위치로 등록</button>
      {locMsg && <span className="muted small"> {locMsg}</span>}

      {TAG_GROUPS.map(([title, opts]) => (
        <div key={title}>
          <label className="label">{title}</label>
          {opts.map((o) => <button type="button" key={o} className={`chip ${f.tags.includes(o) ? "sel" : ""}`} onClick={() => toggle(o)}>{o}</button>)}
        </div>
      ))}
      <label className="label">기타 분야 (쉼표로 구분)</label>
      <input className="input" placeholder="예: 자애명상, 아로마" value={extra} onChange={(e) => setExtra(e.target.value)} />
      {err && <p className="error">{err}</p>}
      <button className="btn btn-primary" style={{ marginTop: 18 }} disabled={busy}>{busy ? "저장 중…" : submitLabel}</button>
    </form>
  );
}
