import { Elysia, t } from "elysia";
import { authenticate, requireRole } from "@/middleware/auth";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { asc, eq, and } from "drizzle-orm";
import { notFound, conflict } from "@/middleware/errors";

// Kelola kelas (jenjang = grade_level, nama = kelas). Digunakan untuk targeting
// jadwal dan penempatan siswa. ADMIN & TEACHER boleh (sejalan dengan bank soal).
export const classesController = new Elysia({
  prefix: "/classes",
  tags: ["Classes"],
})
  .use(authenticate())
  .guard(requireRole("ADMIN", "TEACHER"))
  .get(
    "/",
    async () =>
      db.select().from(classes).orderBy(asc(classes.gradeLevel), asc(classes.name)),
    { detail: { summary: "List kelas (admin & guru)" } },
  )
  .post(
    "/",
    async ({ body }) => {
      const dup = await db.query.classes.findFirst({
        where: (c, { and, eq }) => and(eq(c.gradeLevel, body.gradeLevel), eq(c.name, body.name)),
      });
      if (dup) throw conflict("Kelas dengan jenjang & nama tersebut sudah ada");
      const [row] = await db.insert(classes).values(body).returning();
      return row!;
    },
    {
      body: t.Object({
        gradeLevel: t.Number({ minimum: 1, maximum: 12 }),
        name: t.String({ minLength: 1 }),
      }),
      detail: { summary: "Tambah kelas (admin & guru)" },
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => {
      const existing = await db.query.classes.findFirst({
        where: eq(classes.id, params.id),
      });
      if (!existing) throw notFound("Kelas tidak ditemukan");
      const set: Record<string, unknown> = {};
      if (body.gradeLevel !== undefined) set.gradeLevel = body.gradeLevel;
      if (body.name !== undefined) set.name = body.name;
      const [row] = await db.update(classes).set(set).where(eq(classes.id, params.id)).returning();
      return row!;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        gradeLevel: t.Optional(t.Number({ minimum: 1, maximum: 12 })),
        name: t.Optional(t.String({ minLength: 1 })),
      }),
      detail: { summary: "Update kelas (admin & guru)" },
    },
  )
  .delete(
    "/:id",
    async ({ params }) => {
      const existing = await db.query.classes.findFirst({
        where: eq(classes.id, params.id),
      });
      if (!existing) throw notFound("Kelas tidak ditemukan");
      await db.delete(classes).where(eq(classes.id, params.id));
      return { success: true };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Hapus kelas (admin & guru)" },
    },
  );
