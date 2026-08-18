import { Elysia, t } from "elysia";
import { authenticate, requireRole } from "@/middleware/auth";
import { subjectService, topicService } from "./subjects.service";

const religionSchema = t.Union([
  t.Literal("ISLAM"),
  t.Literal("KRISTEN"),
  t.Literal("KATOLIK"),
  t.Literal("HINDU"),
  t.Literal("BUDDHA"),
  t.Literal("KONGHUCU"),
  t.Literal("OTHER"),
]);

// Hanya ADMIN & TEACHER yang boleh mengelola bank soal; siswa read-only via /questions
export const subjectsController = new Elysia({
  prefix: "/subjects",
  tags: ["Question Bank"],
})
  .use(authenticate())

  .get(
    "/",
    async ({ query }) =>
      subjectService.list({ search: query.search, page: query.page, limit: query.limit }),
    {
      query: t.Object({
        search: t.Optional(t.String()),
        page: t.Optional(t.Number()),
        limit: t.Optional(t.Number()),
      }),
      detail: { summary: "List subjects" },
    },
  )

  .get(
    "/:id",
    async ({ params }) => subjectService.getById(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Get subject with topics & questions" },
    },
  )

  .guard(requireRole("ADMIN", "TEACHER"))
  .post(
    "/",
    async ({ body }) => subjectService.create(body),
    {
      body: t.Object({
        code: t.String({ minLength: 1 }),
        name: t.String({ minLength: 1 }),
        religion: t.Optional(t.Nullable(religionSchema)),
      }),
      detail: { summary: "Create subject" },
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => subjectService.update(params.id, body),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        code: t.Optional(t.String({ minLength: 1 })),
        name: t.Optional(t.String({ minLength: 1 })),
        religion: t.Optional(t.Nullable(religionSchema)),
      }),
      detail: { summary: "Update subject" },
    },
  )
  .delete(
    "/:id",
    async ({ params }) => subjectService.remove(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Delete subject" },
    },
  );

export const topicsController = new Elysia({
  prefix: "/topics",
  tags: ["Question Bank"],
})
  .use(authenticate())
  .guard(requireRole("ADMIN", "TEACHER"))
  .post(
    "/",
    async ({ body }) => topicService.create(body.subjectId, body.name),
    {
      body: t.Object({
        subjectId: t.String(),
        name: t.String({ minLength: 1 }),
      }),
      detail: { summary: "Create topic" },
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => topicService.update(params.id, body.name),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ name: t.String({ minLength: 1 }) }),
      detail: { summary: "Update topic" },
    },
  )
  .delete(
    "/:id",
    async ({ params }) => topicService.remove(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Delete topic" },
    },
  );