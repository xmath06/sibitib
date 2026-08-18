import { Elysia, t } from "elysia";
import { authenticate, requireRole } from "@/middleware/auth";
import { userService } from "./users.service";

const religionSchema = t.Union([
  t.Literal("ISLAM"),
  t.Literal("KRISTEN"),
  t.Literal("KATOLIK"),
  t.Literal("HINDU"),
  t.Literal("BUDDHA"),
  t.Literal("KONGHUCU"),
  t.Literal("OTHER"),
]);

// Manajemen siswa dari sisi guru/admin. Role dipaksa STUDENT agar guru hanya
// mengelola siswa (pisah dari manajemen user lengkap milik admin di /users).
export const teacherStudentsController = new Elysia({
  prefix: "/teacher/students",
  tags: ["Teacher Students"],
})
  .use(authenticate())
  .guard(requireRole("ADMIN", "TEACHER"))

  .get(
    "/",
    async ({ query }) =>
      userService.list({
        search: query.search,
        role: "STUDENT",
        page: query.page,
        limit: query.limit,
      }),
    {
      query: t.Object({
        search: t.Optional(t.String()),
        page: t.Optional(t.Number()),
        limit: t.Optional(t.Number()),
      }),
      detail: { summary: "List siswa (guru & admin)" },
    },
  )

  .post(
    "/",
    async ({ body }) =>
      userService.create({
        name: body.name,
        username: body.username,
        password: body.password,
        role: "STUDENT",
        classId: body.classId,
        religion: body.religion,
      }),
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        username: t.String({ minLength: 3 }),
        password: t.String({ minLength: 6 }),
        classId: t.Optional(t.Nullable(t.String())),
        religion: t.Optional(t.Nullable(religionSchema)),
      }),
      detail: { summary: "Tambah siswa (guru & admin)" },
    },
  )

  .put(
    "/:id",
    async ({ params, body }) =>
      userService.update(params.id, {
        name: body.name,
        username: body.username,
        password: body.password,
        classId: body.classId,
        religion: body.religion,
      }),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        username: t.Optional(t.String({ minLength: 3 })),
        password: t.Optional(t.String({ minLength: 6 })),
        classId: t.Optional(t.Nullable(t.String())),
        religion: t.Optional(t.Nullable(religionSchema)),
      }),
      detail: { summary: "Update siswa (guru & admin)" },
    },
  )

  .delete(
    "/:id",
    async ({ params }) => userService.remove(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Hapus siswa (guru & admin)" },
    },
  );
