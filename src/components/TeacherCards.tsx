/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Avatar from "./Avatar";
import { VerifiedIcon } from "./Icons";
import { won } from "@/lib/format";

export type TeacherListItem = {
  id: string; displayName: string; tagline: string; region: string; profileImageUrl: string; coverImageUrl: string;
  tags: string[]; verified: boolean; ratingAvg: number; ratingCount: number; minPrice: number | null;
  formats: string[]; distanceKm: number | null;
};

const fmtLabel = (f: string[]) => (f.includes("OFFLINE") && f.includes("ONLINE") ? "대면·비대면" : f.includes("ONLINE") ? "비대면" : f.includes("OFFLINE") ? "대면" : "");
const rating = (t: TeacherListItem) => (t.ratingCount ? `★ ${t.ratingAvg.toFixed(1)}` : "신규");

export function TeacherCard({ t }: { t: TeacherListItem }) {
  const avatar = <Avatar name={t.displayName} url={t.profileImageUrl} />;
  return (
    <Link href={`/teachers/${t.id}`} className="card click">
      {t.verified ? <span className="avatar-ring">{avatar}</span> : avatar}
      <div className="tc-body">
        <div className="row between" style={{ gap: 8 }}>
          <b className="tc-name"><span>{t.displayName}</span>{t.verified && <VerifiedIcon size={16} />}</b>
          <span className={`rating${t.ratingCount ? "" : " new"}`}>{rating(t)}</span>
        </div>
        {t.tagline && <div className="tagline">{t.tagline}</div>}
        <div className="meta">
          {[t.region, fmtLabel(t.formats), t.ratingCount ? `후기 ${t.ratingCount}` : null, t.distanceKm != null ? `${t.distanceKm}km` : null].filter(Boolean).join(" · ")}
        </div>
        <div className="tc-foot">
          <div>{t.tags.slice(0, 2).map((x) => <span className="badge" key={x}>#{x}</span>)}</div>
          {t.minPrice != null && <span className="price">{won(t.minPrice)}<small>~</small></span>}
        </div>
      </div>
    </Link>
  );
}

export function ReelCard({ t }: { t: TeacherListItem }) {
  const img = t.coverImageUrl || t.profileImageUrl;
  return (
    <Link href={`/teachers/${t.id}`} className="reel-card">
      <div className="rimg">
        {img ? <img src={img} alt="" /> : <span aria-hidden>{t.displayName[0]}</span>}
        <span className={`rpill${t.ratingCount ? "" : " new"}`}>{rating(t)}</span>
      </div>
      <div className="rcap">
        <b>{t.displayName}</b>
        <div className="meta">{t.region || fmtLabel(t.formats)}</div>
      </div>
    </Link>
  );
}
