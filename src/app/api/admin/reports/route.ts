import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireAdmin();
  const rows = await db.select({
    id: schema.reports.id, targetType: schema.reports.targetType, targetId: schema.reports.targetId,
    reason: schema.reports.reason, status: schema.reports.status, adminNote: schema.reports.adminNote,
    createdAt: schema.reports.createdAt, reporterName: schema.users.name, reporterEmail: schema.users.email,
  }).from(schema.reports).innerJoin(schema.users, eq(schema.reports.reporterId, schema.users.id))
    .orderBy(desc(schema.reports.createdAt)).limit(100);
  return ok({ reports: rows });
});
