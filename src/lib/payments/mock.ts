import { randomUUID } from "crypto";
import type { PaymentProvider } from "./types";

/**
 * 개발·테스트용 가짜 PG. 실제 돈은 오가지 않는다.
 * paymentKey 가 "mock_fail" 로 시작하면 결제 실패를 흉내낸다 (실패 시나리오 테스트용).
 */
export const mockProvider: PaymentProvider = {
  name: "mock",
  checkoutParams(order) {
    return { provider: "mock", orderId: order.orderId, amount: order.amount, orderName: order.orderName };
  },
  async confirm({ paymentKey }) {
    if (paymentKey.startsWith("mock_fail")) return { ok: false, reason: "카드 승인이 거절되었습니다. (테스트)" };
    return { ok: true, paymentKey, method: "카드(테스트)", paidAt: new Date() };
  },
  async refund({ idempotencyKey }) {
    return { refundId: `mock_refund_${idempotencyKey}_${randomUUID().slice(0, 8)}` };
  },
};
