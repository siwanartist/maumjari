/**
 * PG(결제대행사) 어댑터 인터페이스
 *
 * 실제 PG사가 정해지면 이 인터페이스를 구현하는 파일(예: src/lib/payments/<pg명>.ts)을
 * 하나 추가하고, src/lib/payments/index.ts 에 등록한 뒤 PAYMENT_PROVIDER 값만 바꾸면 된다.
 * 예약·환불·정산 로직은 이 인터페이스만 사용하므로 수정할 필요가 없다.
 *
 * 결제 흐름 (국내 PG 대부분이 사용하는 "결제창 → 서버 최종승인" 방식 기준)
 *   1) 서버: 예약 + 주문(orderId, 금액) 생성
 *   2) 브라우저: checkoutParams 로 PG 결제창 호출
 *   3) PG → 성공 URL 로 paymentKey 전달
 *   4) 서버: 금액 위변조 검증 후 confirm() 호출 → 결제 확정
 */
export type CheckoutOrder = {
  orderId: string;
  amount: number;
  orderName: string;
  customerEmail: string;
  customerName: string;
};

export type ConfirmInput = { paymentKey: string; orderId: string; amount: number };
export type ConfirmResult =
  | { ok: true; paymentKey: string; method: string; paidAt: Date }
  | { ok: false; reason: string };

export type RefundInput = { paymentKey: string; amount: number; reason: string; idempotencyKey: string };

export interface PaymentProvider {
  readonly name: string;
  /** 브라우저에서 결제창을 띄우는 데 필요한 공개 정보 (비밀키 절대 포함 금지) */
  checkoutParams(order: CheckoutOrder): Record<string, unknown>;
  /** 결제 최종 승인 */
  confirm(input: ConfirmInput): Promise<ConfirmResult>;
  /** 부분/전액 환불. 같은 idempotencyKey 재호출 시 중복 환불되지 않도록 구현해야 한다 */
  refund(input: RefundInput): Promise<{ refundId: string }>;
}
