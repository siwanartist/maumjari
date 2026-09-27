import { handler, ok } from "@/lib/api";
import { endSession } from "@/lib/auth";
export const POST = handler(async () => { await endSession(); return ok({ ok: true }); });
