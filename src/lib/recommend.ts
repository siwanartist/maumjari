/**
 * 1단계 추천: 규칙 기반 스코어링 (기획안 6.2)
 * 점수 = 취향 태그 일치 + 신뢰 보정 평점 + 거리 + 신규 지도자 가산 - 페널티
 * 2단계(행동 데이터 기반)로 교체할 때는 이 파일의 scoreTeacher 만 바꾸면 된다.
 */
export type PrefInput = { motives: string[]; types: string[]; level: string; time: string } | null;
export type TeacherForScore = {
  tags: string[];
  bio: string;
  ratingAvg: number;
  ratingCount: number;
  penaltyCount: number;
  createdAt: Date;
  latitude: number | null;
  longitude: number | null;
};

const PRIOR_MEAN = 4.5; // 리뷰가 적은 지도자의 평점을 평균 쪽으로 당겨 과대평가 방지
const PRIOR_WEIGHT = 5;

export function bayesRating(avg: number, count: number) {
  return (PRIOR_MEAN * PRIOR_WEIGHT + avg * count) / (PRIOR_WEIGHT + count);
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function scoreTeacher(t: TeacherForScore, pref: PrefInput, loc?: { lat: number; lng: number } | null) {
  let s = 0;
  if (pref) {
    const tagSet = new Set(t.tags);
    const haystack = (t.tags.join(" ") + " " + t.bio).toLowerCase();
    for (const m of [...pref.motives, ...pref.types]) {
      if (tagSet.has(m)) s += 12;
      else if (m.length >= 2 && haystack.includes(m.toLowerCase())) s += 6; // "기타" 직접입력 값 부분 일치
    }
    if (tagSet.has(pref.level)) s += 8;
    if (tagSet.has(pref.time)) s += 4;
  }
  s += bayesRating(t.ratingAvg, t.ratingCount) * 3;
  if (Date.now() - t.createdAt.getTime() < 30 * 86_400_000) s += 5; // 신규 지도자 노출 보장 (콜드스타트)
  if (loc && t.latitude != null && t.longitude != null) {
    const d = distanceKm(loc.lat, loc.lng, t.latitude, t.longitude);
    s += d <= 3 ? 6 : d <= 10 ? 3 : 0;
  }
  s -= t.penaltyCount * 3;
  return s;
}
