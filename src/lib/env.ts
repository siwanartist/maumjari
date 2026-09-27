// 필수 환경변수를 한 곳에서 검증 — 누락 시 즉시 실패시켜 잘못된 설정으로 운영되는 것을 막는다
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 이(가) 설정되지 않았습니다. .env.example 참고`);
  return v;
}

export const env = {
  get sessionSecret() {
    const s = required("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET 은 32자 이상이어야 합니다.");
    return s;
  },
  get appUrl() { return process.env.APP_URL ?? "http://localhost:3000"; },
  get paymentProvider() { return process.env.PAYMENT_PROVIDER ?? "mock"; },
  get platformFeeRate() {
    const r = Number(process.env.PLATFORM_FEE_RATE ?? "0.15");
    if (!(r >= 0 && r < 1)) throw new Error("PLATFORM_FEE_RATE 는 0 이상 1 미만이어야 합니다.");
    return r;
  },
  get bookingResponseHours() { return Number(process.env.BOOKING_RESPONSE_HOURS ?? "24"); },
  get emailProvider() { return process.env.EMAIL_PROVIDER ?? "console"; },
  get emailFrom() { return process.env.EMAIL_FROM ?? "noreply@example.com"; },
  get cronSecret() { return required("CRON_SECRET"); },
};
