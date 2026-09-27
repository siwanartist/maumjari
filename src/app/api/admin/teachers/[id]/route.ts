import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { deliver } from "@/lib/notify";

const body = z.object({
  action: z.enum(["approve", "reject", "suspend", "verify", "unverify"]),
  reason: z.string().trim().max(500).default(""),
});

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const { action, reason } = await parseBody(req, body);
  const t = await db.query.teachers.findFirst({ where: eq(schema.teachers.id, params.id) });
  if (!t) throw new ApiError(404, "지도자를 찾을 수 없습니다.");
  if ((action === "reject" || action === "suspend") && !reason) throw new ApiError(400, "사유를 입력해주세요.");

  const set =
    action === "approve" ? { status: "APPROVED" as const, rejectReason: "" } :
    action === "reject" ? { status: "REJECTED" as const, rejectReason: reason } :
    action === "suspend" ? { status: "SUSPENDED" as const, rejectReason: reason } :
    { verified: action === "verify" };
  await db.update(schema.teachers).set(set).where(eq(schema.teachers.id, t.id));

  const msg: Record<string, [string, string]> = {
    approve: ["지도자 심사가 승인되었습니다", "이제 클래스를 등록하고 예약을 받을 수 있습니다."],
    reject: ["지도자 심사가 반려되었습니다", `사유: ${reason} — 프로필을 수정하면 다시 심사합니다.`],
    suspend: ["지도자 활동이 정지되었습니다", `사유: ${reason}`],
    verify: ["자격 인증 배지가 부여되었습니다", "프로필에 인증 배지가 표시됩니다."],
  };
  if (msg[action]) await deliver([{ userId: t.userId, type: "TEACHER_STATUS", title: msg[action][0], body: msg[action][1], link: "/teacher" }]);
  return ok({ ok: true });
});
