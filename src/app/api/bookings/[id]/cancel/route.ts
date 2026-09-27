import { z } from "zod";
import { handler, parseBody, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { userCancel } from "@/lib/booking";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const u = await requireUser();
  const { reason } = await parseBody(req, z.object({ reason: z.string().max(200).default("") }));
  return ok(await userCancel(u.id, params.id, reason));
});
