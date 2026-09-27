import { z } from "zod";
import { desc, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
const { threads, teachers, users } = schema;

/** 내 대화 목록 (수강생으로서 + 지도자로서) */
export const GET = handler(async () => {
  const u = await requireUser();
  const myTeacher = await db.query.teachers.findFirst({ where: eq(teachers.userId, u.id) });
  const rows = await db.select({
    id: threads.id, lastMessageAt: threads.lastMessageAt, userId: threads.userId,
    teacherName: teachers.displayName, studentName: users.name,
  }).from(threads)
    .innerJoin(teachers, eq(threads.teacherId, teachers.id))
    .innerJoin(users, eq(threads.userId, users.id))
    .where(myTeacher ? or(eq(threads.userId, u.id), eq(threads.teacherId, myTeacher.id)) : eq(threads.userId, u.id))
    .orderBy(desc(threads.lastMessageAt));
  return ok({
    threads: rows.map((r) => ({
      id: r.id, lastMessageAt: r.lastMessageAt,
      counterpartName: r.userId === u.id ? r.teacherName : r.studentName,
      asTeacher: r.userId !== u.id,
    })),
  });
});

/** 지도자와의 대화방 열기 (없으면 생성) */
export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const { teacherId } = await parseBody(req, z.object({ teacherId: z.string().min(1) }));
  const t = await db.query.teachers.findFirst({ where: eq(teachers.id, teacherId) });
  if (!t || t.status !== "APPROVED") throw new ApiError(404, "지도자를 찾을 수 없습니다.");
  if (t.userId === u.id) throw new ApiError(400, "본인에게는 메시지를 보낼 수 없습니다.");
  await db.insert(threads).values({ userId: u.id, teacherId }).onConflictDoNothing();
  const th = await db.query.threads.findFirst({
    where: (x, { and, eq }) => and(eq(x.userId, u.id), eq(x.teacherId, teacherId)),
  });
  return ok({ id: th!.id });
});
