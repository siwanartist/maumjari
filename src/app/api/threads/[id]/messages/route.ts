import { z } from "zod";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assertThreadAccess } from "@/lib/threads";
import { deliver } from "@/lib/notify";

export const dynamic = "force-dynamic";
const { messages, threads } = schema;

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const u = await requireUser();
  const { thread, isStudent } = await assertThreadAccess(params.id, u.id);
  const rows = await db.select().from(messages).where(eq(messages.threadId, params.id)).orderBy(asc(messages.createdAt)).limit(500);
  await db.update(messages).set({ readAt: new Date() })
    .where(and(eq(messages.threadId, params.id), ne(messages.senderId, u.id), isNull(messages.readAt)));
  return ok({
    title: isStudent ? thread.teacher.displayName : thread.user.name,
    teacherId: thread.teacherId,
    messages: rows.map((m) => ({ id: m.id, body: m.body, mine: m.senderId === u.id, createdAt: m.createdAt })),
  });
});

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const u = await requireUser();
  const { counterpartUserId } = await assertThreadAccess(params.id, u.id);
  const { body } = await parseBody(req, z.object({ body: z.string().trim().min(1).max(1000) }));
  await db.insert(messages).values({ threadId: params.id, senderId: u.id, body });
  await db.update(threads).set({ lastMessageAt: new Date() }).where(eq(threads.id, params.id));
  // 대화방당 짧은 시간 내 알림 폭주 방지: 10분 단위로 1회
  const bucket = Math.floor(Date.now() / 600_000);
  await deliver([{ userId: counterpartUserId, type: "MESSAGE", title: `${u.name}님의 새 메시지`, body: body.slice(0, 60),
    link: `/messages/${params.id}`, dedupeKey: `msg:${params.id}:${counterpartUserId}:${bucket}` }]);
  return ok({ ok: true }, 201);
});
