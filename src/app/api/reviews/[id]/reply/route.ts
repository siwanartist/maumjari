import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const { teacher } = await requireTeacher();
  const { reply } = await parseBody(req, z.object({ reply: z.string().trim().max(500) }));
  const r = await db.update(schema.reviews).set({ reply })
    .where(and(eq(schema.reviews.id, params.id), eq(schema.reviews.teacherId, teacher.id))).returning({ id: schema.reviews.id });
  if (!r.length) throw new ApiError(404, "후기를 찾을 수 없습니다.");
  return ok({ ok: true });
});
