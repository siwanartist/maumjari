// 온보딩 선택지 — 프로토타입과 동일. "기타"는 직접 입력값으로 저장된다.
export const MOTIVES = ["스트레스/불안 완화", "수면 개선", "집중력 향상", "영적 성장", "단순 호기심"];
export const TYPES = ["마음챙김", "호흡명상", "바디스캔", "걷기명상", "소리명상"];
export const LEVELS = ["입문", "중급", "숙련"];
export const TIMES = ["아침", "점심", "저녁", "주말"];
export const OTHER = "기타";

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "결제 대기",
  REQUESTED: "승인 대기",
  APPROVED: "예약 확정",
  REJECTED: "거절 · 환불",
  EXPIRED: "만료 · 환불",
  CANCELED_BY_USER: "취소됨",
  CANCELED_BY_TEACHER: "지도자 취소 · 환불",
  COMPLETED: "수업 완료",
  NO_SHOW_USER: "불참",
  NO_SHOW_TEACHER: "지도자 불참 · 환불",
};

/** 좌석을 차지하는 예약 상태 */
export const SEAT_HOLDING_STATUSES = ["PENDING_PAYMENT", "REQUESTED", "APPROVED"] as const;
/** 결제 대기 좌석 유지 시간 */
export const PAYMENT_HOLD_MINUTES = 15;
