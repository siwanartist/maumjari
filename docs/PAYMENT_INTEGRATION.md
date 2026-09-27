# 실제 PG(결제대행사) 연결 방법

현재는 `mock`(가짜 결제)입니다. 예약·환불·정산 로직은 `PaymentProvider` 인터페이스만 사용하므로,
PG사가 정해지면 **어댑터 파일 1개 + 결제창 호출 코드 몇 줄**만 추가하면 됩니다.

## 결제 흐름 (이미 구현됨)

```
[브라우저] 결제하기 클릭
   → POST /api/bookings              서버: 좌석 확보 + 주문번호(orderId)·금액 생성, 15분 유지
   → PG 결제창 호출                  ← ② 여기에 PG SDK 코드 추가
   → PG가 /book/success?paymentKey=&orderId=&amount= 로 이동
   → POST /api/payments/confirm      서버: 금액 위변조 검증 → provider.confirm() → 결제 확정
                                     → 예약 "승인 대기", 지도자에게 알림
지도자 거절 / 24시간 미응답 / 취소   → provider.refund() 자동 호출 (전액·부분)
```

## 할 일

### ① 어댑터 작성 — `src/lib/payments/<pg명>.ts`

`src/lib/payments/types.ts` 의 인터페이스 3개 메서드를 구현합니다.

| 메서드 | 할 일 |
|---|---|
| `checkoutParams(order)` | 결제창에 넘길 **공개** 정보 반환 (클라이언트 키, 주문번호, 금액, 상품명, 성공/실패 URL). 비밀키 포함 금지 |
| `confirm({paymentKey, orderId, amount})` | PG 결제 승인 API 호출 (비밀키 사용). 성공 시 `{ok:true, paymentKey, method, paidAt}` |
| `refund({paymentKey, amount, reason, idempotencyKey})` | PG 취소 API 호출. `amount` 만큼 부분 취소. `idempotencyKey` 를 PG의 멱등키 헤더로 전달해 중복 환불 방지 |

그다음 `src/lib/payments/index.ts` 의 `providers` 에 등록하고 환경변수 `PAYMENT_PROVIDER` 를 그 이름으로 바꿉니다.
키는 `PG_CLIENT_KEY`, `PG_SECRET_KEY` 환경변수로 받으세요 (코드에 직접 쓰지 말 것).

### ② 결제창 호출 — `src/app/book/[scheduleId]/page.tsx`

`startPayment()` 안의 "실제 PG 연동 지점" 주석 위치에서, `o.checkout` 값으로 PG SDK 결제창을 엽니다.
성공 URL: `${APP_URL}/book/success`, 실패 URL: `${APP_URL}/book/fail` (두 페이지는 이미 구현됨)

### ③ (권장) 웹훅

결제 직후 사용자가 창을 닫아 `/book/success` 에 도달하지 못하는 경우를 대비해, PG 웹훅(입금·취소 통지)을
`/api/payments/webhook` 에 추가하는 것을 권장합니다. 서명 검증은 `PG_WEBHOOK_SECRET` 으로 하고,
처리 로직은 `confirmPayment` 와 같은 규칙(주문번호로 조회 → 이미 PAID 면 무시)을 따르면 됩니다.

## 이미 구현된 안전장치

- 서버에서 금액 재검증 (브라우저가 보낸 금액을 믿지 않음)
- 같은 결제 승인 요청 반복 → 한 번만 처리 (행 잠금 + 상태 확인)
- 누적 환불액이 결제액을 넘지 않도록 제한
- PG 승인 성공 후 DB 저장이 실패하면 즉시 자동 결제 취소 (실패 시 `[CRITICAL]` 로그 → 수동 환불)
- 운영 환경에서 mock 결제 사용 시 차단
