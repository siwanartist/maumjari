import { z } from "zod";

const url = z.string().trim().max(500).refine((v) => v === "" || /^https:\/\//.test(v), "이미지/증빙 링크는 https:// 로 시작해야 합니다.");

export const teacherProfileSchema = z.object({
  displayName: z.string().trim().min(1, "활동명을 입력해주세요.").max(20),
  tagline: z.string().trim().max(60).default(""),
  bio: z.string().trim().min(20, "소개글을 20자 이상 작성해주세요.").max(2000),
  certification: z.string().trim().max(1000).default(""),
  certProofUrl: url.default(""),
  profileImageUrl: url.default(""),
  coverImageUrl: url.default(""),
  region: z.string().trim().max(40).default(""),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(30)).min(1, "지도 가능한 분야를 1개 이상 선택해주세요.").max(20),
});

export const classSchema = z.object({
  title: z.string().trim().min(2, "클래스명을 입력해주세요.").max(60),
  description: z.string().trim().max(2000).default(""),
  imageUrl: url.default(""),
  format: z.enum(["OFFLINE", "ONLINE"]),
  location: z.string().trim().max(300).default(""),
  capacity: z.number().int().min(1).max(100),
  price: z.number().int().min(1000, "가격은 1,000원 이상이어야 합니다.").max(10_000_000),
  durationMinutes: z.number().int().min(10).max(600),
  bookingCutoffHours: z.number().int().min(0).max(168).default(3),
  isPublished: z.boolean().default(true),
});

/** 스케줄 추가: 단발 일시 목록 또는 매주 반복 */
export const scheduleSchema = z.union([
  z.object({ mode: z.literal("once"), startsAt: z.array(z.coerce.date()).min(1).max(50) }),
  z.object({
    mode: z.literal("weekly"),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1),  // 0=일요일
    time: z.string().regex(/^\d{2}:\d{2}$/),                   // KST "19:30"
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),          // KST 날짜
    weeks: z.number().int().min(1).max(12),
  }),
]);
