import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";

export const dynamic = "force-dynamic";
const { settlements, bookings, schedules, classes } = schema;

export const GET = handler(async () => {
  const { teacher } = await requireTeacher();
  const rows = await db.select({
    id: settlements.id, grossAmount: settlements.grossAmount, feeAmount: settlements.feeAmount, netAmount: settlements.netAmount,
    status: settlements.status, paidAt: settlements.paidAt, createdAt: settlements.createdAt,
    classTitle: classes.title, startsAt: schedules.startsAt,
  }).from(settlements)
    .innerJoin(bookings, eq(settlements.bookingId, bookings.id))
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(eq(settlements.teacherId, teacher.id)).orderBy(desc(settlements.createdAt));
  const pending = rows.filter((r) => r.status === "PENDING").reduce((a, r) => a + r.netAmount, 0);
  const paid = rows.filter((r) => r.status === "PAID").reduce((a, r) => a + r.netAmount, 0);
  return ok({ settlements: rows, summary: { pending, paid } });
});
