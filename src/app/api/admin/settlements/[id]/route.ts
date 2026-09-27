import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

/** 1차 범위: 정산은 운영자가 계좌이체 후 '지급 완료'로 수동 표시 (자동 지급은 2차) */
export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  await requireAdmin();
  const r = await db.update(schema.settlements).set({ status: "PAID", paidAt: new Date() })
    .where(and(eq(schema.settlements.id, params.id), eq(schema.settlements.status, "PENDING"))).returning({ id: schema.settlements.id });
  if (!r.length) throw new ApiError(409, "이미 지급되었거나 없는 정산입니다.");
  return ok({ ok: true });
});
