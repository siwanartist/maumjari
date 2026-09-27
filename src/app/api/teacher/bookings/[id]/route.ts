import { z } from "zod";
import { handler, parseBody, ok } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { teacherDecide, teacherCancel, teacherMarkAfterClass } from "@/lib/booking";

const body = z.object({
  action: z.enum(["approve", "reject", "cancel", "complete", "noshow"]),
  reason: z.string().trim().max(300).default(""),
});

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const { teacher } = await requireTeacher({ approvedOnly: true });
  const { action, reason } = await parseBody(req, body);
  switch (action) {
    case "approve": return ok(await teacherDecide(teacher.id, params.id, "approve"));
    case "reject": return ok(await teacherDecide(teacher.id, params.id, "reject", reason));
    case "cancel":
      if (!reason) return ok({ error: "취소 사유를 입력해주세요." }, 400);
      await teacherCancel(teacher.id, params.id, reason); return ok({ ok: true });
    case "complete": await teacherMarkAfterClass(teacher.id, params.id, "COMPLETED"); return ok({ ok: true });
    case "noshow": await teacherMarkAfterClass(teacher.id, params.id, "NO_SHOW_USER"); return ok({ ok: true });
  }
});
