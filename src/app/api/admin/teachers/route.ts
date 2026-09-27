import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get("status") as "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | null;
  const rows = await db.select({
    id: schema.teachers.id, displayName: schema.teachers.displayName, bio: schema.teachers.bio,
    certification: schema.teachers.certification, certProofUrl: schema.teachers.certProofUrl, tags: schema.teachers.tags,
    region: schema.teachers.region, status: schema.teachers.status, verified: schema.teachers.verified,
    penaltyCount: schema.teachers.penaltyCount, createdAt: schema.teachers.createdAt, email: schema.users.email,
  }).from(schema.teachers).innerJoin(schema.users, eq(schema.teachers.userId, schema.users.id))
    .where(status ? eq(schema.teachers.status, status) : undefined).orderBy(desc(schema.teachers.createdAt));
  return ok({ teachers: rows });
});
