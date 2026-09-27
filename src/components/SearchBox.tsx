"use client";
import { SearchIcon } from "./Icons";

/** 목록 위에 붙는 검색창 — 입력 즉시 필터링, 오른쪽 × 로 지우기 */
export default function SearchBox({ value, onChange, placeholder, label }: {
  value: string; onChange: (v: string) => void; placeholder: string; label: string;
}) {
  return (
    <div className="searchbox" role="search">
      <span className="sicon" aria-hidden><SearchIcon size={20} /></span>
      <input className="input" type="search" inputMode="search" autoComplete="off" enterKeyHint="search"
        placeholder={placeholder} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && <button type="button" className="sclear" aria-label="검색어 지우기" onClick={() => onChange("")}>×</button>}
    </div>
  );
}
