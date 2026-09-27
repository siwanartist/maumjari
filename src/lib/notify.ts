import { db, schema } from "@/db";
import { env } from "./env";

/**
 * 알림 발송
 * - 인앱 알림: notifications 테이블 (앱 상단 종 아이콘에서 확인)
 * - 이메일: EMAIL_PROVIDER 어댑터 (기본값 console = 서버 로그 출력만)
 *
 * 서비스 로직은 트랜잭션 안에서 Notice 를 모아두고(outbox), 커밋이 끝난 뒤 deliver() 로 발송한다.
 * → DB 작업이 롤백됐는데 "예약 확정" 알림만 나가는 사고를 막기 위함.
 */
export type Notice = {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  dedupeKey?: string;
};

type EmailAdapter = { send(to: string, subject: string, text: string): Promise<void> };

const emailAdapters: Record<string, EmailAdapter> = {
  console: {
    async send(to, subject, text) {
      if (process.env.NODE_ENV !== "test") console.log(`[EMAIL] to=${to} | ${subject} | ${text}`);
    },
  },
  // 실제 이메일 발송 서비스 계약 후 여기에 어댑터 추가
};

export async function deliver(notices: Notice[]) {
  for (const n of notices) {
    try {
      const inserted = await db
        .insert(schema.notifications)
        .values({ userId: n.userId, type: n.type, title: n.title, body: n.body, link: n.link ?? "", dedupeKey: n.dedupeKey })
        .onConflictDoNothing()
        .returning({ id: schema.notifications.id });
      if (inserted.length === 0) continue; // 이미 보낸 리마인드

      const user = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, n.userId) });
      const adapter = emailAdapters[env.emailProvider];
      if (user && adapter) await adapter.send(user.email, `[마음자리] ${n.title}`, `${n.body}\n${env.appUrl}${n.link ?? ""}`);
    } catch (e) {
      // 알림 실패가 예약/결제 자체를 실패시키지 않도록 로그만 남긴다
      console.error("[NOTIFY ERROR]", e);
    }
  }
}
