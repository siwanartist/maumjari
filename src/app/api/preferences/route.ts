import { db, schema } from "@/db";
import { handler, parseBody, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prefSchema } from "@/lib/validators";

export const PUT = handler(async (req: Request) => {
  const u = await requireUser();
  const p = await parseBody(req, prefSchema);
  await db.insert(schema.userPreferences).values({ userId: u.id, ...p })
    .onConflictDoUpdate({ target: schema.userPreferences.userId, set: p });
  return ok({ ok: true });
});
