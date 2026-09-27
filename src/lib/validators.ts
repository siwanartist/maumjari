import { z } from "zod";

const item = z.string().trim().min(1).max(30);
// 온보딩: 항목별 최소 1개 필수 (기획 요구사항). "기타"는 클라이언트에서 직접입력 값으로 치환되어 온다.
export const prefSchema = z.object({
  motives: z.array(item).min(1, "명상 계기를 1개 이상 선택해주세요.").max(10),
  types: z.array(item).min(1, "선호 명상 유형을 1개 이상 선택해주세요.").max(10),
  level: item,
  time: item,
});
export type PrefInput = z.infer<typeof prefSchema>;
