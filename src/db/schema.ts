/**
 * 마음자리 데이터 모델
 * - 금액: 원(KRW) 정수
 * - 시각: timestamptz (UTC 저장, 화면에서 Asia/Seoul로 표시)
 */
import {
  pgTable, pgEnum, text, integer, boolean, timestamp, doublePrecision,
  uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { randomUUID } from "crypto";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

export const roleEnum = pgEnum("role", ["USER", "TEACHER", "ADMIN"]);
export const teacherStatusEnum = pgEnum("teacher_status", ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]);
export const classFormatEnum = pgEnum("class_format", ["OFFLINE", "ONLINE"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "PENDING_PAYMENT",     // 결제 진행 중 (좌석 임시 확보, 15분 후 만료)
  "REQUESTED",           // 결제 완료, 지도자 승인 대기
  "APPROVED",            // 지도자 승인 = 예약 확정
  "REJECTED",            // 지도자 거절 → 전액 환불
  "EXPIRED",             // 지도자 미응답 또는 결제 미완료 → (결제됐으면) 전액 환불
  "CANCELED_BY_USER",    // 사용자 취소 → 정책에 따라 환불
  "CANCELED_BY_TEACHER", // 확정 후 지도자 취소 → 전액 환불 + 페널티
  "COMPLETED",           // 수업 완료 → 정산 대상
  "NO_SHOW_USER",        // 사용자 노쇼 → 환불 없음, 정산 대상
  "NO_SHOW_TEACHER",     // 지도자 노쇼 (운영자 확인) → 전액 환불 + 페널티
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "READY", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED", "CANCELED",
]);
export const settlementStatusEnum = pgEnum("settlement_status", ["PENDING", "PAID"]);
export const reportStatusEnum = pgEnum("report_status", ["OPEN", "RESOLVED", "DISMISSED"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  bio: text("bio").notNull().default(""),
  region: text("region").notNull().default(""),
  role: roleEnum("role").notNull().default("USER"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userPreferences = pgTable("user_preferences", {
  id: id(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  motives: text("motives").array().notNull().default([]),
  types: text("types").array().notNull().default([]),
  level: text("level").notNull(),
  time: text("time").notNull(),
  updatedAt: updatedAt(),
});

export const teachers = pgTable("teachers", {
  id: id(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  tagline: text("tagline").notNull().default(""),
  bio: text("bio").notNull().default(""),
  certification: text("certification").notNull().default(""),
  certProofUrl: text("cert_proof_url").notNull().default(""),
  profileImageUrl: text("profile_image_url").notNull().default(""),
  coverImageUrl: text("cover_image_url").notNull().default(""),
  region: text("region").notNull().default(""),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  tags: text("tags").array().notNull().default([]), // 추천 매칭용 태그 (계기/유형/수준)
  status: teacherStatusEnum("status").notNull().default("PENDING"),
  verified: boolean("verified").notNull().default(false), // 자격 인증 배지
  rejectReason: text("reject_reason").notNull().default(""),
  ratingAvg: doublePrecision("rating_avg").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  penaltyCount: integer("penalty_count").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({ statusIdx: index("teachers_status_idx").on(t.status) }));

export const classes = pgTable("classes", {
  id: id(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  format: classFormatEnum("format").notNull(),
  location: text("location").notNull().default(""), // 대면: 주소 / 비대면: 접속 안내 (확정자에게만 공개)
  capacity: integer("capacity").notNull().default(1),
  price: integer("price").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  bookingCutoffHours: integer("booking_cutoff_hours").notNull().default(3),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({ teacherIdx: index("classes_teacher_idx").on(t.teacherId) }));

export const schedules = pgTable("class_schedules", {
  id: id(),
  classId: text("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  isCanceled: boolean("is_canceled").notNull().default(false),
  createdAt: createdAt(),
}, (t) => ({ classStartIdx: index("schedules_class_start_idx").on(t.classId, t.startsAt) }));

export const bookings = pgTable("bookings", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  scheduleId: text("schedule_id").notNull().references(() => schedules.id),
  status: bookingStatusEnum("status").notNull().default("PENDING_PAYMENT"),
  amount: integer("amount").notNull(),
  responseDeadline: timestamp("response_deadline", { withTimezone: true }),
  cancelReason: text("cancel_reason").notNull().default(""),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  userIdx: index("bookings_user_idx").on(t.userId),
  scheduleStatusIdx: index("bookings_schedule_status_idx").on(t.scheduleId, t.status),
  deadlineIdx: index("bookings_status_deadline_idx").on(t.status, t.responseDeadline),
}));

export const payments = pgTable("payments", {
  id: id(),
  bookingId: text("booking_id").notNull().unique().references(() => bookings.id),
  orderId: text("order_id").notNull().unique(), // PG 주문번호 = 중복결제 방지 키
  provider: text("provider").notNull(),
  providerPaymentKey: text("provider_payment_key").unique(),
  method: text("method").notNull().default(""),
  amount: integer("amount").notNull(),
  refundedAmount: integer("refunded_amount").notNull().default(0),
  status: paymentStatusEnum("status").notNull().default("READY"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  failureReason: text("failure_reason").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const refunds = pgTable("refunds", {
  id: id(),
  paymentId: text("payment_id").notNull().references(() => payments.id),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  providerRefundId: text("provider_refund_id"),
  createdAt: createdAt(),
});

export const settlements = pgTable("settlements", {
  id: id(),
  teacherId: text("teacher_id").notNull().references(() => teachers.id),
  bookingId: text("booking_id").notNull().unique().references(() => bookings.id),
  grossAmount: integer("gross_amount").notNull(), // 결제액 - 환불액
  feeAmount: integer("fee_amount").notNull(),     // 플랫폼 수수료
  netAmount: integer("net_amount").notNull(),     // 지도자 지급액
  status: settlementStatusEnum("status").notNull().default("PENDING"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({ teacherStatusIdx: index("settlements_teacher_status_idx").on(t.teacherId, t.status) }));

export const reviews = pgTable("reviews", {
  id: id(),
  bookingId: text("booking_id").notNull().unique().references(() => bookings.id),
  userId: text("user_id").notNull().references(() => users.id),
  teacherId: text("teacher_id").notNull().references(() => teachers.id),
  rating: integer("rating").notNull(),
  body: text("body").notNull(),
  reply: text("reply").notNull().default(""),
  isHidden: boolean("is_hidden").notNull().default(false),
  createdAt: createdAt(),
}, (t) => ({ teacherIdx: index("reviews_teacher_idx").on(t.teacherId, t.createdAt) }));

export const threads = pgTable("chat_threads", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  teacherId: text("teacher_id").notNull().references(() => teachers.id),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => ({ pairUnique: uniqueIndex("chat_threads_pair_unique").on(t.userId, t.teacherId) }));

export const messages = pgTable("messages", {
  id: id(),
  threadId: text("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({ threadIdx: index("messages_thread_idx").on(t.threadId, t.createdAt) }));

export const notifications = pgTable("notifications", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link").notNull().default(""),
  dedupeKey: text("dedupe_key").unique(), // 리마인드 중복 발송 방지
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({ userIdx: index("notifications_user_idx").on(t.userId, t.createdAt) }));

export const reports = pgTable("reports", {
  id: id(),
  reporterId: text("reporter_id").notNull().references(() => users.id),
  targetType: text("target_type").notNull(), // TEACHER | REVIEW | BOOKING
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  status: reportStatusEnum("status").notNull().default("OPEN"),
  adminNote: text("admin_note").notNull().default(""),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => ({ statusIdx: index("reports_status_idx").on(t.status) }));

// ─── relations (조인 쿼리용) ───
export const usersRelations = relations(users, ({ one }) => ({
  preference: one(userPreferences, { fields: [users.id], references: [userPreferences.userId] }),
  teacher: one(teachers, { fields: [users.id], references: [teachers.userId] }),
}));
export const teachersRelations = relations(teachers, ({ one, many }) => ({
  user: one(users, { fields: [teachers.userId], references: [users.id] }),
  classes: many(classes),
  reviews: many(reviews),
}));
export const classesRelations = relations(classes, ({ one, many }) => ({
  teacher: one(teachers, { fields: [classes.teacherId], references: [teachers.id] }),
  schedules: many(schedules),
}));
export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  class: one(classes, { fields: [schedules.classId], references: [classes.id] }),
  bookings: many(bookings),
}));
export const bookingsRelations = relations(bookings, ({ one }) => ({
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  schedule: one(schedules, { fields: [bookings.scheduleId], references: [schedules.id] }),
  payment: one(payments, { fields: [bookings.id], references: [payments.bookingId] }),
  review: one(reviews, { fields: [bookings.id], references: [reviews.bookingId] }),
}));
export const paymentsRelations = relations(payments, ({ one, many }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
  refunds: many(refunds),
}));
export const refundsRelations = relations(refunds, ({ one }) => ({
  payment: one(payments, { fields: [refunds.paymentId], references: [payments.id] }),
}));
export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  teacher: one(teachers, { fields: [reviews.teacherId], references: [teachers.id] }),
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
}));
export const threadsRelations = relations(threads, ({ one, many }) => ({
  user: one(users, { fields: [threads.userId], references: [users.id] }),
  teacher: one(teachers, { fields: [threads.teacherId], references: [teachers.id] }),
  messages: many(messages),
}));
export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(threads, { fields: [messages.threadId], references: [threads.id] }),
}));
export const settlementsRelations = relations(settlements, ({ one }) => ({
  teacher: one(teachers, { fields: [settlements.teacherId], references: [teachers.id] }),
  booking: one(bookings, { fields: [settlements.bookingId], references: [bookings.id] }),
}));

export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
