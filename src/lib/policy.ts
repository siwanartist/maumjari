/**
 * 취소·환불 정책 (기획안 8.4)
 * ※ 전자상거래법상 청약철회 규정과의 정합성은 오픈 전 법률 검토 필요
 */
export const USER_CANCEL_TIERS = [
  { minHoursBefore: 72, percent: 100 },
  { minHoursBefore: 24, percent: 50 },
  { minHoursBefore: 0, percent: 0 },
];

export const POLICY_TEXT = [
  "지도자 승인 전 취소: 전액 환불",
  "수업 3일 전까지 취소: 전액 환불",
  "수업 1일 전까지 취소: 50% 환불",
  "수업 1일 전 이후 취소 및 불참: 환불 불가",
  "지도자 거절·미응답·취소: 전액 자동 환불",
];

/** 사용자 취소 시 환불액 */
export function userCancelRefund(status: string, amount: number, startsAt: Date, now = new Date()) {
  if (status === "REQUESTED") return amount;
  if (status !== "APPROVED") return 0;
  const hours = (startsAt.getTime() - now.getTime()) / 3_600_000;
  const tier = USER_CANCEL_TIERS.find((t) => hours >= t.minHoursBefore) ?? { percent: 0 };
  return Math.floor((amount * tier.percent) / 100);
}

/** 수업 종료 후 지도자가 완료 처리하지 않으면 자동 완료되기까지의 시간 (이 기간 내 사용자 신고 가능) */
export const AUTO_COMPLETE_HOURS = 48;
