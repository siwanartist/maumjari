import { NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** 라우트 핸들러 공통 래퍼: 에러를 일관된 JSON으로 변환하고, 예상 못한 에러는 로그에 남긴다 */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return NextResponse.json({ error: e.issues[0]?.message ?? "입력값을 확인해주세요." }, { status: 400 });
      console.error("[API ERROR]", e);
      return NextResponse.json({ error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let json: unknown;
  try { json = await req.json(); } catch { throw new ApiError(400, "요청 형식이 올바르지 않습니다."); }
  return schema.parse(json);
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
