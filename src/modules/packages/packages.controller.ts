import { Elysia, t } from "elysia";
import { authenticate, requireRole } from "@/middleware/auth";
import { packageService } from "./packages.service";

export const packagesController = new Elysia({
  prefix: "/packages",
  tags: ["Packages"],
})
  .use(authenticate())

  .get(
    "/",
    async ({ query }) =>
      packageService.list({ search: query.search, page: query.page, limit: query.limit }),
    {
      query: t.Object({
        search: t.Optional(t.String()),
        page: t.Optional(t.Number()),
        limit: t.Optional(t.Number()),
      }),
      detail: { summary: "List exam packages" },
    },
  )
  .get(
    "/:id",
    async ({ params }) => packageService.getById(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Get package with questions" },
    },
  )

  .guard(requireRole("ADMIN", "TEACHER"))
  .post(
    "/",
    async ({ body }) => packageService.create(body),
    {
      body: t.Object({
        subjectId: t.String(),
        title: t.String({ minLength: 1 }),
        hasTimer: t.Optional(t.Boolean()),
        durationMinutes: t.Optional(t.Nullable(t.Number())),
        passScore: t.Optional(t.Union([t.String(), t.Number()])),
        isRandomQuestions: t.Optional(t.Boolean()),
        isRandomOptions: t.Optional(t.Boolean()),
        questionIds: t.Optional(t.Array(t.String())),
      }),
      detail: { summary: "Create exam package" },
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => packageService.update(params.id, body),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        subjectId: t.Optional(t.String()),
        title: t.Optional(t.String({ minLength: 1 })),
        hasTimer: t.Optional(t.Boolean()),
        durationMinutes: t.Optional(t.Nullable(t.Number())),
        passScore: t.Optional(t.Union([t.String(), t.Number()])),
        isRandomQuestions: t.Optional(t.Boolean()),
        isRandomOptions: t.Optional(t.Boolean()),
        questionIds: t.Optional(t.Array(t.String())),
      }),
      detail: { summary: "Update exam package" },
    },
  )
  .delete(
    "/:id",
    async ({ params }) => packageService.remove(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Delete exam package" },
    },
  );