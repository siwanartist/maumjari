import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireAdmin();
  const rows = await db.select({
    id: schema.settlements.id, netAmount: schema.settlements.netAmount, feeAmount: schema.settlements.feeAmount,
    grossAmount: schema.settlements.grossAmount, status: schema.settlements.status, createdAt: schema.settlements.createdAt,
    paidAt: schema.settlements.paidAt, teacherName: schema.teachers.displayName,
  }).from(schema.settlements).innerJoin(schema.teachers, eq(schema.settlements.teacherId, schema.teachers.id))
    .orderBy(desc(schema.settlements.createdAt)).limit(200);
  return ok({ settlements: rows });
});
