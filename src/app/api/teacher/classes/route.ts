import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { handler, parseBody, ok } from "@/lib/api";
import { requireTeacher } from "@/lib/auth";
import { classSchema } from "@/lib/teacher-validators";

export const dynamic = "force-dynamic";
const { classes, schedules } = schema;

export const GET = handler(async () => {
  const { teacher } = await requireTeacher();
  const cls = await db.select().from(classes).where(eq(classes.teacherId, teacher.id)).orderBy(desc(classes.createdAt));
  const sch = cls.length
    ? await db.select().from(schedules).where(and(inArray(schedules.classId, cls.map((c) => c.id)), gt(schedules.startsAt, new Date())))
        .orderBy(asc(schedules.startsAt))
    : [];
  return ok({ classes: cls.map((c) => ({ ...c, schedules: sch.filter((s) => s.classId === c.id) })) });
});

export const POST = handler(async (req: Request) => {
  const { teacher } = await requireTeacher();
  const b = await parseBody(req, classSchema);
  const [c] = await db.insert(classes).values({ ...b, teacherId: teacher.id }).returning();
  return ok({ id: c.id }, 201);
});
