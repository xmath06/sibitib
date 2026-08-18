import { Elysia, t } from "elysia";
import { authenticate, requireRole } from "@/middleware/auth";
import { examService } from "./exams.service";
import { db } from "@/db";
import { studentExams } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { computeTimer } from "@/utils/timer";
import { notFound, badRequest } from "@/middleware/errors";

export const examsController = new Elysia({
  prefix: "/exams",
  tags: ["Exam Execution"],
})
  .use(authenticate())
  .guard(requireRole("STUDENT"))

  // Mulai ujian (dengan access code bila diperlukan)
  .post(
    "/start/:scheduleId",
    async ({ params, body, authUser }) =>
      examService.startExam(params.scheduleId, authUser.id, body.accessCode),
    {
      params: t.Object({ scheduleId: t.String() }),
      body: t.Object({
        accessCode: t.Optional(t.String()),
      }),
      detail: { summary: "Start exam for a schedule" },
    },
  )

  // Ambil data ujian + server-synced remaining time
  .get(
    "/:studentExamId",
    async ({ params, authUser }) =>
      examService.getExamData(params.studentExamId, authUser.id),
    {
      params: t.Object({ studentExamId: t.String() }),
      detail: { summary: "Get exam questions & server time" },
    },
  )

  // Server time check ringan (utk sync timer client)
  .get(
    "/:studentExamId/time",
    async ({ params, authUser }) => {
      const se = await db.query.studentExams.findFirst({
        where: and(
          eq(studentExams.id, params.studentExamId),
          eq(studentExams.studentId, authUser.id),
        ),
        with: { schedule: { with: { package: true } } },
      });
      if (!se) throw notFound("Student exam not found");

      const timer = computeTimer({
        hasTimer: se.schedule.package.hasTimer,
        durationMinutes: se.schedule.package.durationMinutes,
        timeExtensionMinutes: se.schedule.timeExtensionMinutes,
        startedAt: se.startedAt,
      });
      return {
        success: true,
        data: { ...timer, serverNow: Date.now() },
      };
    },
    {
      params: t.Object({ studentExamId: t.String() }),
      detail: { summary: "Server-synchronized remaining time" },
    },
  )

  // Debounced auto-save jawaban
  .post(
    "/:studentExamId/answers",
    async ({ params, body, authUser }) =>
      examService.autosaveAnswers(params.studentExamId, authUser.id, body.answers),
    {
      params: t.Object({ studentExamId: t.String() }),
      body: t.Object({
        answers: t.Array(
          t.Object({
            questionId: t.String(),
            selectedOptionId: t.Optional(t.String()),
            selectedOptionIds: t.Optional(t.Array(t.String())),
            essayAnswer: t.Optional(t.String()),
            isFlagged: t.Optional(t.Boolean()),
          }),
        ),
      }),
      detail: { summary: "Auto-save answers (debounced)" },
    },
  )

  // Submit ujian (auto-grading pilihan ganda)
  .post(
    "/:studentExamId/submit",
    async ({ params, authUser }) =>
      examService.submitExam(params.studentExamId, authUser.id),
    {
      params: t.Object({ studentExamId: t.String() }),
      detail: { summary: "Submit exam with auto-grading" },
    },
  )

  // Hasil ujian
  .get(
    "/:studentExamId/result",
    async ({ params, authUser }) =>
      examService.getResult(params.studentExamId, authUser.id),
    {
      params: t.Object({ studentExamId: t.String() }),
      detail: { summary: "Get exam result" },
    },
  );