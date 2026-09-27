import { z } from "zod";
import { handler, parseBody, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { confirmPayment } from "@/lib/booking";

/**
 * 결제창 성공 후 호출 — 서버에서 금액을 재검증하고 PG 최종 승인.
 * 실제 PG 연동 시: PG 성공 리다이렉트 URL(/book/success?paymentKey=&orderId=&amount=)에서 이 API를 호출.
 */
const body = z.object({
  orderId: z.string().min(1),
  paymentKey: z.string().min(1),
  amount: z.coerce.number().int().positive(),
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  return ok(await confirmPayment(u.id, await parseBody(req, body)));
});
