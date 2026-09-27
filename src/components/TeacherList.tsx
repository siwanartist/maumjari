"use client";
import { useEffect, useState } from "react";
import { api, loadPendingPrefs } from "@/lib/client";
import { TeacherCard, ReelCard, type TeacherListItem } from "./TeacherCards";
import { TYPES } from "@/lib/constants";

type Resp = { teachers: TeacherListItem[]; recommendedIds: string[]; personalized: boolean };
const SORTS = [["reco", "추천순"], ["rating", "평점순"], ["distance", "거리순"], ["new", "신규순"], ["price", "가격순"]] as const;

function buildQuery(sort: string, loc: { lat: number; lng: number } | null, type: string, format: string) {
  const q = new URLSearchParams({ sort });
  if (loc) { q.set("lat", String(loc.lat)); q.set("lng", String(loc.lng)); }
  if (type) q.set("type", type);
  if (format) q.set("format", format);
  const p = loadPendingPrefs(); // 비로그인 사용자의 온보딩 결과
  if (p) { q.set("motives", p.motives.join(",")); q.set("types", p.types.join(",")); q.set("level", p.level); q.set("time", p.time); }
  return q.toString();
}

export default function TeacherList({ mode }: { mode: "home" | "explore" }) {
  const [sort, setSort] = useState("reco");
  const [type, setType] = useState("");
  const [format, setFormat] = useState("");
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [data, setData] = useState<Resp | null>(null);
  const [recoData, setRecoData] = useState<Resp | null>(null);
  const [err, setErr] = useState("");
  const [locMsg, setLocMsg] = useState("");

  useEffect(() => {
    setErr("");
    api<Resp>(`/api/teachers?${buildQuery(sort, loc, type, format)}`).then(setData).catch((e) => setErr(e.message));
  }, [sort, loc, type, format]);
  useEffect(() => {
    if (mode === "home") api<Resp>(`/api/teachers?${buildQuery("reco", null, "", "")}`).then(setRecoData).catch(() => {});
  }, [mode]);

  function pickSort(s: string) {
    if (s === "distance" && !loc) {
      if (!navigator.geolocation) { setLocMsg("이 브라우저에서는 위치를 사용할 수 없습니다."); return; }
      setLocMsg("위치를 확인하는 중…");
      navigator.geolocation.getCurrentPosition(
        (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocMsg(""); setSort("distance"); },
        () => setLocMsg("위치 권한을 허용하면 가까운 지도자 순으로 볼 수 있습니다."),
        { timeout: 8000 },
      );
      return;
    }
    setSort(s);
  }

  const byId = new Map((recoData?.teachers ?? []).map((t) => [t.id, t]));
  const reco = (recoData?.recommendedIds ?? []).map((id) => byId.get(id)!).filter(Boolean);
  const top = reco[0];

  return (
    <>
      {mode === "home" && top && (
        <section className="hero" aria-label="추천 지도자">
          <span className="hbadge">{recoData?.personalized ? "회원님 맞춤 1순위" : "지금 인기 있는 지도자"}</span>
          <h2>{top.displayName}</h2>
          <div className="sub">
            {[...top.tags.slice(0, 2), ""].join(" · ")}
            {top.ratingCount ? <span className="star">★ {top.ratingAvg.toFixed(1)}</span> : "신규"}
            {top.ratingCount ? ` (${top.ratingCount})` : ""}
          </div>
          <a className="hbtn" href={`/teachers/${top.id}`}>프로필 보기</a>
        </section>
      )}
      {mode === "home" && reco.length > 1 && (
        <>
          <div className="section-title">{recoData?.personalized ? "회원님을 위한 추천 지도자" : "추천 지도자"}</div>
          <div className="reel">{reco.map((t) => <ReelCard key={t.id} t={t} />)}</div>
        </>
      )}

      <div className="section-title">전체 지도자</div>
      {mode === "explore" && (
        <div className="pad" style={{ paddingTop: 0, paddingBottom: 6 }}>
          <div>
            <span className={`chip ${type === "" ? "sel" : ""}`} onClick={() => setType("")}>전체 유형</span>
            {TYPES.map((t) => <span key={t} className={`chip ${type === t ? "sel" : ""}`} onClick={() => setType(type === t ? "" : t)}>{t}</span>)}
          </div>
          <div>
            {[["", "대면·비대면"], ["OFFLINE", "대면"], ["ONLINE", "비대면"]].map(([v, l]) =>
              <span key={v} className={`chip ${format === v ? "sel" : ""}`} onClick={() => setFormat(v)}>{l}</span>)}
          </div>
        </div>
      )}
      <div className="sortbar" role="tablist" aria-label="정렬">
        {SORTS.map(([k, l]) => <button key={k} className={sort === k ? "sel" : ""} onClick={() => pickSort(k)}>{l}</button>)}
      </div>
      {locMsg && <p className="pad small muted" style={{ paddingTop: 0 }}>{locMsg}</p>}
      <div className="pad" style={{ paddingTop: 0 }}>
        {err && <p className="error">{err}</p>}
        {!data && !err && [0, 1, 2].map((i) => <div key={i} className="skeleton" />)}
        {data?.teachers.length === 0 && <p className="muted">조건에 맞는 지도자가 없습니다. 필터를 바꿔보세요.</p>}
        {data?.teachers.map((t) => <TeacherCard key={t.id} t={t} />)}
      </div>
    </>
  );
}
