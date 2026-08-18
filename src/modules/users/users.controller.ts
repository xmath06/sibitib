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

export const usersController = new Elysia({
  prefix: "/users",
  tags: ["Users"],
})
  .use(authenticate())
  .guard(requireRole("ADMIN"))

  .get(
    "/",
    async ({ query }) =>
      userService.list({
        search: query.search,
        role: query.role,
        page: query.page,
        limit: query.limit,
      }),
    {
      query: t.Object({
        search: t.Optional(t.String()),
        role: t.Optional(t.Union([t.Literal("ADMIN"), t.Literal("TEACHER"), t.Literal("STUDENT")])),
        page: t.Optional(t.Number()),
        limit: t.Optional(t.Number()),
      }),
      detail: { summary: "List users (admin only)" },
    },
  )

  .post(
    "/",
    async ({ body }) => userService.create(body),
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        username: t.String({ minLength: 3 }),
        password: t.String({ minLength: 6 }),
        role: t.Union([t.Literal("ADMIN"), t.Literal("TEACHER"), t.Literal("STUDENT")]),
        classId: t.Optional(t.Nullable(t.String())),
        religion: t.Optional(t.Nullable(religionSchema)),
      }),
      detail: { summary: "Create user (admin only)" },
    },
  )

  .put(
    "/:id",
    async ({ params, body }) => userService.update(params.id, body),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        username: t.Optional(t.String({ minLength: 3 })),
        password: t.Optional(t.String({ minLength: 6 })),
        role: t.Optional(t.Union([t.Literal("ADMIN"), t.Literal("TEACHER"), t.Literal("STUDENT")])),
        classId: t.Optional(t.Nullable(t.String())),
        religion: t.Optional(t.Nullable(religionSchema)),
      }),
      detail: { summary: "Update user (admin only)" },
    },
  )

  .delete(
    "/:id",
    async ({ params }) => userService.remove(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Delete user (admin only)" },
    },
  );