import { handler, ok } from "@/lib/api";
import { enabledProviders } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** 설정된(키가 있는) 소셜 로그인 제공자 목록 — 로그인 화면이 버튼을 그릴지 결정 */
export const GET = handler(async () => ok({ providers: enabledProviders() }));
