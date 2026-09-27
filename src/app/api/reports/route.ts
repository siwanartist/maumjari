import { z } from "zod";
import { db, schema } from "@/db";
import { handler, parseBody, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

const body = z.object({
  targetType: z.enum(["TEACHER", "REVIEW", "BOOKING"]),
  targetId: z.string().min(1),
  reason: z.string().trim().min(5, "신고 사유를 5자 이상 적어주세요.").max(1000),
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const b = await parseBody(req, body);
  await db.insert(schema.reports).values({ reporterId: u.id, ...b });
  return ok({ ok: true }, 201);
});
