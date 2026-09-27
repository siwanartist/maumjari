import { and, eq, inArray, min } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { scoreTeacher, distanceKm, bayesRating, type PrefInput } from "@/lib/recommend";

export const dynamic = "force-dynamic";
const { teachers, classes, userPreferences } = schema;

/**
 * GET /api/teachers?sort=reco|rating|distance|new|price&lat=&lng=&type=&format=OFFLINE|ONLINE
 * 비로그인 사용자는 온보딩 결과를 쿼리(motives,types,level,time)로 넘겨 추천을 받는다.
 * ※ 초기 소규모 기준으로 승인 지도자 전체를 불러와 점수화한다. 지도자 수가 수천 명을 넘으면 페이지네이션/DB 정렬로 전환.
 */
export const GET = handler(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const sort = q.get("sort") ?? "reco";
  const lat = q.get("lat") ? Number(q.get("lat")) : null;
  const lng = q.get("lng") ? Number(q.get("lng")) : null;
  const loc = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  let pref: PrefInput = null;
  const u = await getCurrentUser();
  if (u) {
    const p = await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, u.id) });
    if (p) pref = p;
  }
  if (!pref && q.get("motives")) {
    pref = {
      motives: q.get("motives")!.split(",").filter(Boolean),
      types: (q.get("types") ?? "").split(",").filter(Boolean),
      level: q.get("level") ?? "", time: q.get("time") ?? "",
    };
  }

  const rows = await db.select().from(teachers).where(eq(teachers.status, "APPROVED"));
  const ids = rows.map((r) => r.id);
  const priceRows = ids.length
    ? await db.select({ teacherId: classes.teacherId, minPrice: min(classes.price) }).from(classes)
        .where(and(inArray(classes.teacherId, ids), eq(classes.isPublished, true))).groupBy(classes.teacherId)
    : [];
  const formatRows = ids.length
    ? await db.selectDistinct({ teacherId: classes.teacherId, format: classes.format }).from(classes)
        .where(and(inArray(classes.teacherId, ids), eq(classes.isPublished, true)))
    : [];
  const priceMap = new Map(priceRows.map((r) => [r.teacherId, r.minPrice]));
  const formatMap = new Map<string, string[]>();
  for (const f of formatRows) formatMap.set(f.teacherId, [...(formatMap.get(f.teacherId) ?? []), f.format]);

  let list = rows.map((t) => ({
    id: t.id, displayName: t.displayName, tagline: t.tagline, region: t.region,
    profileImageUrl: t.profileImageUrl, coverImageUrl: t.coverImageUrl, tags: t.tags, verified: t.verified,
    ratingAvg: Math.round(t.ratingAvg * 10) / 10, ratingCount: t.ratingCount,
    minPrice: priceMap.get(t.id) ?? null, formats: formatMap.get(t.id) ?? [],
    distanceKm: loc && t.latitude != null && t.longitude != null
      ? Math.round(distanceKm(loc.lat, loc.lng, t.latitude, t.longitude) * 10) / 10 : null,
    createdAt: t.createdAt,
    _score: scoreTeacher(t, pref, loc),
    _rating: bayesRating(t.ratingAvg, t.ratingCount),
  }));

  const type = q.get("type"), format = q.get("format");
  if (type) list = list.filter((t) => t.tags.includes(type));
  if (format) list = list.filter((t) => t.formats.includes(format));

  const sorters: Record<string, (a: typeof list[0], b: typeof list[0]) => number> = {
    reco: (a, b) => b._score - a._score,
    rating: (a, b) => b._rating - a._rating,
    distance: (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
    new: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    price: (a, b) => (a.minPrice ?? 1e12) - (b.minPrice ?? 1e12),
  };
  list.sort(sorters[sort] ?? sorters.reco);
  // 추천 배너·캐러셀에는 예약 가능한 클래스가 있는 지도자만
  const recommended = [...list].filter((t) => t.minPrice != null).sort(sorters.reco).slice(0, 6).map((t) => t.id);

  return ok({
    teachers: list.map(({ _score, _rating, createdAt, ...t }) => t),
    recommendedIds: recommended,
    personalized: !!pref,
  });
});
