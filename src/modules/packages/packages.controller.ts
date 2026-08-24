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
    async ({ query, authUser }) =>
      packageService.list(
        { search: query.search, page: query.page, limit: query.limit },
        authUser,
      ),
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
    async ({ params, authUser }) => packageService.getById(params.id, authUser),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Get package with questions" },
    },
  )
  .get(
    "/:id/export",
    async ({ params }) => {
      const { buffer, filename } = await packageService.exportDocx(params.id);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Export package to DOCX" },
    },
  )

  .guard(requireRole("ADMIN", "TEACHER"))
  .post(
    "/",
    async ({ body, authUser }) => packageService.create(body, authUser),
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
        typeScoreWeight: t.Optional(t.Any()),
      }),
      detail: { summary: "Create exam package" },
    },
  )
  .put(
    "/:id",
    async ({ params, body, authUser }) => packageService.update(params.id, body, authUser),
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
        typeScoreWeight: t.Optional(t.Any()),
      }),
      detail: { summary: "Update exam package" },
    },
  )
  .delete(
    "/:id",
    async ({ params, authUser }) => packageService.remove(params.id, authUser),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Delete exam package" },
    },
  );