import { Elysia, t } from "elysia";
import { authenticate, requireRole } from "@/middleware/auth";
import { questionService } from "./questions.service";

export const questionsController = new Elysia({
  prefix: "/questions",
  tags: ["Question Bank"],
})
  .use(authenticate())

  .get(
    "/",
    async ({ query }) => questionService.listByTopic(query.topicId),
    {
      query: t.Object({ topicId: t.String() }),
      detail: { summary: "List questions by topic" },
    },
  )
  .get(
    "/:id",
    async ({ params }) => questionService.getById(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Get question detail with options" },
    },
  )

  .guard(requireRole("ADMIN", "TEACHER"))
  .post(
    "/",
    async ({ body }) => questionService.create(body),
    {
      body: t.Object({
        topicId: t.String(),
        questionText: t.String({ minLength: 1 }),
        questionType: t.Union([
          t.Literal("MCQ"),
          t.Literal("ESSAY"),
          t.Literal("TRUE_FALSE"),
          t.Literal("POLY_CHOICE"),
          t.Literal("MULTI_SELECT"),
        ]),
        minWordCount: t.Optional(t.Number()),
        maxWordCount: t.Optional(t.Number()),
        options: t.Optional(
          t.Array(
            t.Object({
              optionText: t.String({ minLength: 1 }),
              scoreWeight: t.Optional(t.Union([t.String(), t.Number()])),
            }),
          ),
        ),
      }),
      detail: { summary: "Create question with options" },
    },
  )
  .put(
    "/:id",
    async ({ params, body }) => questionService.update(params.id, body),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        questionText: t.Optional(t.String({ minLength: 1 })),
        questionType: t.Optional(
          t.Union([
            t.Literal("MCQ"),
            t.Literal("ESSAY"),
            t.Literal("TRUE_FALSE"),
            t.Literal("POLY_CHOICE"),
            t.Literal("MULTI_SELECT"),
          ]),
        ),
        minWordCount: t.Optional(t.Nullable(t.Number())),
        maxWordCount: t.Optional(t.Nullable(t.Number())),
        options: t.Optional(
          t.Array(
            t.Object({
              optionText: t.String({ minLength: 1 }),
              scoreWeight: t.Optional(t.Union([t.String(), t.Number()])),
            }),
          ),
        ),
      }),
      detail: { summary: "Update question (replace options if provided)" },
    },
  )
  .delete(
    "/:id",
    async ({ params }) => questionService.remove(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Delete question" },
    },
  );