/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Avatar from "./Avatar";
import { won } from "@/lib/format";

export type TeacherListItem = {
  id: string; displayName: string; tagline: string; region: string; profileImageUrl: string; coverImageUrl: string;
  tags: string[]; verified: boolean; ratingAvg: number; ratingCount: number; minPrice: number | null;
  formats: string[]; distanceKm: number | null;
};

const fmtLabel = (f: string[]) => (f.includes("OFFLINE") && f.includes("ONLINE") ? "대면·비대면" : f.includes("ONLINE") ? "비대면" : f.includes("OFFLINE") ? "대면" : "");
const rating = (t: TeacherListItem) => (t.ratingCount ? `★ ${t.ratingAvg.toFixed(1)}` : "신규");

export function TeacherCard({ t }: { t: TeacherListItem }) {
  return (
    <Link href={`/teachers/${t.id}`} className="card click">
      <Avatar name={t.displayName} url={t.profileImageUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row between"><b>{t.displayName}{t.verified && <span className="badge solid" style={{ margin: "0 0 0 6px" }}>인증</span>}</b><span>{rating(t)}</span></div>
        <div className="meta">
          {[t.region, fmtLabel(t.formats), t.ratingCount ? `후기 ${t.ratingCount}` : null, t.distanceKm != null ? `${t.distanceKm}km` : null].filter(Boolean).join(" · ")}
        </div>
        <div>
          {t.tags.slice(0, 2).map((x) => <span className="badge" key={x}>#{x}</span>)}
          {t.minPrice != null && <span className="badge">{won(t.minPrice)}~</span>}
        </div>
      </div>
    </Link>
  );
}

export function ReelCard({ t }: { t: TeacherListItem }) {
  return (
    <Link href={`/teachers/${t.id}`} className="reel-card">
      <div className="rimg">{t.coverImageUrl || t.profileImageUrl ? <img src={t.coverImageUrl || t.profileImageUrl} alt="" /> : t.displayName[0]}</div>
      <b>{t.displayName}</b>
      <div className="meta small">{rating(t)} · {t.region || fmtLabel(t.formats)}</div>
    </Link>
  );
}
