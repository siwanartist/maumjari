import { handler, ok, ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { sweepBookings, sendReminders } from "@/lib/booking";

export const dynamic = "force-dynamic";

/**
 * 주기 작업 (10분마다 호출 권장)
 * - 결제 미완료 주문 만료 / 지도자 미응답 예약 자동 환불 / 미처리 수업 자동 완료
 * - 수업 전일·1시간 전 리마인드
 * 호출: GET /api/cron/sweep  헤더 Authorization: Bearer <CRON_SECRET>
 */
export const GET = handler(async (req: Request) => {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) throw new ApiError(401, "unauthorized");
  const sweep = await sweepBookings();
  const reminders = await sendReminders();
  return ok({ ...sweep, ...reminders, at: new Date().toISOString() });
});
