import { desc, eq, sql, count, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const { users, teachers, bookings, payments, settlements, reports, classes, schedules } = schema;

export const GET = handler(async () => {
  await requireAdmin();
  const [[u], [tp], [ta], [b], [pay], [st], [rp]] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(teachers).where(eq(teachers.status, "PENDING")),
    db.select({ n: count() }).from(teachers).where(eq(teachers.status, "APPROVED")),
    db.select({
      total: count(),
      approved: sql<number>`count(*) filter (where ${bookings.status} in ('APPROVED','COMPLETED','NO_SHOW_USER'))`,
      requested: sql<number>`count(*) filter (where ${bookings.status} = 'REQUESTED')`,
    }).from(bookings).where(sql`${bookings.status} <> 'PENDING_PAYMENT'`),
    db.select({ paid: sum(payments.amount), refunded: sum(payments.refundedAmount) }).from(payments)
      .where(sql`${payments.status} in ('PAID','PARTIALLY_REFUNDED','REFUNDED')`),
    db.select({
      pendingNet: sql<number>`coalesce(sum(${settlements.netAmount}) filter (where ${settlements.status}='PENDING'),0)`,
      fees: sql<number>`coalesce(sum(${settlements.feeAmount}),0)`,
    }).from(settlements),
    db.select({ n: count() }).from(reports).where(eq(reports.status, "OPEN")),
  ]);
  const recentPayments = await db.select({
    orderId: payments.orderId, amount: payments.amount, refundedAmount: payments.refundedAmount, status: payments.status,
    createdAt: payments.createdAt, classTitle: classes.title, userName: users.name, bookingStatus: bookings.status, bookingId: bookings.id,
  }).from(payments)
    .innerJoin(bookings, eq(payments.bookingId, bookings.id))
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .innerJoin(users, eq(bookings.userId, users.id))
    .where(sql`${payments.status} <> 'READY' and ${payments.status} <> 'CANCELED'`)
    .orderBy(desc(payments.createdAt)).limit(30);
  return ok({
    users: Number(u.n), teachersPending: Number(tp.n), teachersApproved: Number(ta.n),
    bookings: { total: Number(b.total), confirmed: Number(b.approved), awaiting: Number(b.requested) },
    gross: Number(pay.paid ?? 0), refunded: Number(pay.refunded ?? 0),
    settlementPending: Number(st.pendingNet), platformFees: Number(st.fees), openReports: Number(rp.n),
    recentPayments,
  });
});
