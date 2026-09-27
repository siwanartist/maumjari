import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { teacher } = await requireTeacher();
  const rows = await db.select({
    id: schema.reviews.id, rating: schema.reviews.rating, body: schema.reviews.body, reply: schema.reviews.reply,
    createdAt: schema.reviews.createdAt, userName: schema.users.name,
  }).from(schema.reviews).innerJoin(schema.users, eq(schema.reviews.userId, schema.users.id))
    .where(eq(schema.reviews.teacherId, teacher.id)).orderBy(desc(schema.reviews.createdAt));
  return ok({ reviews: rows });
});
