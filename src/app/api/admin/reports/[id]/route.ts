import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { adminTeacherNoShow } from "@/lib/booking";
import { recalcTeacherRating } from "@/lib/rating";

/**
 * 신고 처리
 * - dismiss: 기각
 * - resolve: 조치 완료 (선택 조치: 리뷰 숨김 / 지도자 노쇼 확정 → 전액 환불)
 */
const body = z.object({
  action: z.enum(["resolve", "dismiss"]),
  note: z.string().trim().max(1000).default(""),
  hideReview: z.boolean().default(false),
  confirmTeacherNoShow: z.boolean().default(false),
});

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  await requireAdmin();
  const b = await parseBody(req, body);
  const r = await db.query.reports.findFirst({ where: eq(schema.reports.id, params.id) });
  if (!r) throw new ApiError(404, "신고를 찾을 수 없습니다.");
  if (r.status !== "OPEN") throw new ApiError(409, "이미 처리된 신고입니다.");

  if (b.action === "resolve") {
    if (b.hideReview) {
      if (r.targetType !== "REVIEW") throw new ApiError(400, "후기 신고에만 적용할 수 있습니다.");
      await db.transaction(async (tx) => {
        const [rv] = await tx.update(schema.reviews).set({ isHidden: true }).where(eq(schema.reviews.id, r.targetId)).returning({ teacherId: schema.reviews.teacherId });
        if (!rv) throw new ApiError(404, "후기를 찾을 수 없습니다.");
        await recalcTeacherRating(tx, rv.teacherId); // 숨긴 후기는 평점에서도 제외
      });
    }
    if (b.confirmTeacherNoShow) {
      if (r.targetType !== "BOOKING") throw new ApiError(400, "예약 신고에만 적용할 수 있습니다.");
      await adminTeacherNoShow(r.targetId);
    }
  }
  await db.update(schema.reports).set({
    status: b.action === "resolve" ? "RESOLVED" : "DISMISSED", adminNote: b.note, resolvedAt: new Date(),
  }).where(eq(schema.reports.id, r.id));
  return ok({ ok: true });
});
