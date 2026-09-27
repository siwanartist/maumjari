import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { sweepBookings } from "@/lib/booking";

export const dynamic = "force-dynamic";
const { bookings, schedules, classes, users } = schema;

export const GET = handler(async () => {
  const { teacher } = await requireTeacher();
  await sweepBookings();
  const rows = await db.select({
    id: bookings.id, status: bookings.status, amount: bookings.amount, responseDeadline: bookings.responseDeadline,
    createdAt: bookings.createdAt, cancelReason: bookings.cancelReason,
    startsAt: schedules.startsAt, endsAt: schedules.endsAt, classTitle: classes.title, studentName: users.name,
  }).from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .innerJoin(users, eq(bookings.userId, users.id))
    .where(eq(classes.teacherId, teacher.id))
    .orderBy(desc(schedules.startsAt));
  // 결제 전 이탈한 주문은 지도자에게 보이지 않게
  return ok({ bookings: rows.filter((r) => !["PENDING_PAYMENT"].includes(r.status) && !(r.status === "EXPIRED" && !r.responseDeadline)) });
});
