import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError } from "./api";

/** 대화방 참여자 확인: 수강생 본인 또는 해당 지도자 본인만 접근 가능 */
export async function assertThreadAccess(threadId: string, userId: string) {
  const th = await db.query.threads.findFirst({ where: eq(schema.threads.id, threadId), with: { teacher: true, user: true } });
  if (!th) throw new ApiError(404, "대화를 찾을 수 없습니다.");
  const isStudent = th.userId === userId;
  const isTeacher = th.teacher.userId === userId;
  if (!isStudent && !isTeacher) throw new ApiError(403, "접근 권한이 없습니다.");
  return { thread: th, isStudent, counterpartUserId: isStudent ? th.teacher.userId : th.userId };
}
