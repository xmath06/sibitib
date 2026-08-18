import { Elysia, t } from "elysia";
import { authenticate, requireRole } from "@/middleware/auth";
import { gradingService } from "./grading.service";

export const gradingController = new Elysia({
  prefix: "/grading",
  tags: ["Grading"],
})
  .use(authenticate())
  .guard(requireRole("ADMIN", "TEACHER"))

  // Lihat jawaban siswa untuk dinilai
  .get(
    "/:studentExamId",
    async ({ params }) => gradingService.getStudentExam(params.studentExamId),
    {
      params: t.Object({ studentExamId: t.String() }),
      detail: { summary: "Get student exam answers for grading" },
    },
  )

  // Unduh jawaban siswa dalam bentuk DOCX
  .get(
    "/:studentExamId/export",
    async ({ params }) => {
      const { buffer, filename } = await gradingService.exportDocx(params.studentExamId);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
    {
      params: t.Object({ studentExamId: t.String() }),
      detail: { summary: "Export student answers to DOCX" },
    },
  )

  // Input nilai manual & feedback esai (batch per soal)
  .post(
    "/:studentExamId/essays",
    async ({ params, body }) =>
      gradingService.gradeEssays(params.studentExamId, body.grades),
    {
      params: t.Object({ studentExamId: t.String() }),
      body: t.Object({
        grades: t.Array(
          t.Object({
            questionId: t.String(),
            score: t.Union([t.String(), t.Number()]),
            teacherFeedback: t.Optional(t.String()),
          }),
        ),
      }),
      detail: { summary: "Grade essay answers & feedback" },
    },
  )

  // Input nilai satu jawaban spesifik
  .put(
    "/answers/:answerId",
    async ({ params, body }) =>
      gradingService.gradeSingleAnswer(params.answerId, body.score, body.teacherFeedback),
    {
      params: t.Object({ answerId: t.String() }),
      body: t.Object({
        score: t.Union([t.String(), t.Number()]),
        teacherFeedback: t.Optional(t.String()),
      }),
      detail: { summary: "Grade single answer" },
    },
  )

  // Rekap nilai per schedule
  .get(
    "/recap/schedule/:scheduleId",
    async ({ params }) => gradingService.recapBySchedule(params.scheduleId),
    {
      params: t.Object({ scheduleId: t.String() }),
      detail: { summary: "Score recap for a schedule" },
    },
  );