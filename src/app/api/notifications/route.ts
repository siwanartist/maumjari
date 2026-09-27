import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireUser, getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
const { notifications } = schema;

export const GET = handler(async () => {
  const u = await getCurrentUser();
  if (!u) return ok({ notifications: [], unread: 0 });
  const rows = await db.select().from(notifications).where(eq(notifications.userId, u.id))
    .orderBy(desc(notifications.createdAt)).limit(50);
  return ok({ notifications: rows, unread: rows.filter((r) => !r.readAt).length });
});

/** 전체 읽음 처리 */
export const POST = handler(async () => {
  const u = await requireUser();
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, u.id), isNull(notifications.readAt)));
  return ok({ ok: true });
});
