"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MOTIVES, TYPES, LEVELS, TIMES, OTHER } from "@/lib/constants";
import { api, PENDING_PREFS_KEY } from "@/lib/client";

type Key = "motives" | "types" | "level" | "time";
const STEPS: { key: Key; label: string; multi: boolean; opts: string[] }[] = [
  { key: "motives", label: "명상을 시작하게 된 계기를 알려주세요", multi: true, opts: [...MOTIVES, OTHER] },
  { key: "types", label: "선호하는 명상 유형을 골라주세요", multi: true, opts: [...TYPES, OTHER] },
  { key: "level", label: "명상 경험 수준을 알려주세요", multi: false, opts: [...LEVELS, OTHER] },
  { key: "time", label: "주로 명상하고 싶은 시간대는 언제인가요?", multi: false, opts: [...TIMES, OTHER] },
];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState<Record<Key, string[]>>({ motives: [], types: [], level: [], time: [] });
  const [custom, setCustom] = useState<Record<Key, string>>({ motives: "", types: "", level: "", time: "" });
  const [loggedIn, setLoggedIn] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ user: unknown; preference: any }>("/api/me").then((d) => {
      setLoggedIn(!!d.user);
      if (d.preference) {
        // 재진단 시 기존 선택값 복원
        const p = d.preference;
        const split = (vals: string[], base: string[]) => {
          const known = vals.filter((v) => base.includes(v)), other = vals.filter((v) => !base.includes(v));
          return { sel: other.length ? [...known, OTHER] : known, custom: other.join(", ") };
        };
        const m = split(p.motives, MOTIVES), t = split(p.types, TYPES), l = split([p.level], LEVELS), ti = split([p.time], TIMES);
        setSel({ motives: m.sel, types: t.sel, level: l.sel, time: ti.sel });
        setCustom({ motives: m.custom, types: t.custom, level: l.custom, time: ti.custom });
      }
    }).catch(() => {});
  }, []);

  const s = STEPS[step];
  const chosen = sel[s.key];
  const needsCustom = chosen.includes(OTHER);
  const filled = chosen.length > 0 && (!needsCustom || custom[s.key].trim().length > 0);

  function toggle(o: string) {
    setSel((prev) => {
      const cur = prev[s.key];
      const next = s.multi ? (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]) : [o];
      return { ...prev, [s.key]: next };
    });
  }

  function resolved(k: Key) {
    return sel[k].map((v) => (v === OTHER ? custom[k].trim() : v)).filter(Boolean);
  }

  async function next() {
    if (!filled) return;
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    const prefs = { motives: resolved("motives"), types: resolved("types"), level: resolved("level")[0], time: resolved("time")[0] };
    setSaving(true); setErr("");
    try {
      if (loggedIn) await api("/api/preferences", { method: "PUT", body: prefs });
      localStorage.setItem(PENDING_PREFS_KEY, JSON.stringify(prefs));
      router.replace("/");
    } catch (e: any) { setErr(e.message); setSaving(false); }
  }

  return (
    <main className="shell">
      <div className="pad" style={{ paddingBottom: 0 }}>
        <h1 style={{ fontSize: 22 }}>마음자리</h1>
        <p className="muted small" style={{ margin: 0 }}>몇 가지 질문으로 당신에게 맞는 명상 지도자를 찾아드릴게요.</p>
      </div>
      <div className="progress" style={{ marginTop: 18 }}><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      <section className="pad" style={{ paddingTop: 8 }}>
        <h2>{s.label}</h2>
        <p className="muted small" style={{ margin: "0 0 14px" }}>{s.multi ? "해당하는 것을 모두 골라주세요. (최소 1개)" : "하나를 골라주세요."}</p>
        <div role="group" aria-label={s.label}>
          {s.opts.map((o) => (
            <button key={o} type="button" className={`chip ${chosen.includes(o) ? "sel" : ""}`} aria-pressed={chosen.includes(o)} onClick={() => toggle(o)}>{o}</button>
          ))}
        </div>
        {needsCustom && (
          <input className="input" style={{ marginTop: 10 }} placeholder="직접 입력해주세요" maxLength={30} autoFocus
            value={custom[s.key]} onChange={(e) => setCustom({ ...custom, [s.key]: e.target.value })} />
        )}
        {err && <p className="error">{err}</p>}
      </section>
      <div className="pad row between">
        <button className="link" style={{ visibility: step === 0 ? "hidden" : "visible" }} onClick={() => setStep(step - 1)}>이전</button>
        <span className="muted small">{step + 1} / {STEPS.length}</span>
      </div>
      <div className="pad" style={{ paddingTop: 0 }}>
        <button className="btn btn-primary" disabled={!filled || saving} onClick={next}>{step === STEPS.length - 1 ? (saving ? "저장 중…" : "완료") : "다음"}</button>
      </div>
    </main>
  );
}
