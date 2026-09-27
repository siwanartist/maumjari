import { env } from "../env";
import { mockProvider } from "./mock";
import type { PaymentProvider } from "./types";

const providers: Record<string, PaymentProvider> = {
  mock: mockProvider,
  // 실제 PG 계약 후 여기에 추가: 예) mypg: myPgProvider,
};

export function getPaymentProvider(): PaymentProvider {
  const name = env.paymentProvider;
  const p = providers[name];
  if (!p) throw new Error(`알 수 없는 PAYMENT_PROVIDER: ${name}`);
  if (name === "mock" && process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENT !== "true") {
    // 실서비스에서 실수로 가짜 결제가 켜진 채 오픈되는 사고 방지
    throw new Error("운영 환경에서 mock 결제가 설정되어 있습니다. PAYMENT_PROVIDER 를 확인하세요. (테스트 배포라면 ALLOW_MOCK_PAYMENT=true)");
  }
  return p;
}
export type { PaymentProvider } from "./types";
