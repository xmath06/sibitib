import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { studentExams, studentAnswers } from "@/db/schema";
import { notFound, badRequest } from "@/middleware/errors";

export interface GradeEssayInput {
  questionId: string;
  score: number | string;
  teacherFeedback?: string;
}

export const gradingService = {
  // Lihat jawaban seorang siswa (utk dinilai guru)
  async getStudentExam(studentExamId: string) {
    const se = await db.query.studentExams.findFirst({
      where: eq(studentExams.id, studentExamId),
      with: {
        student: true,
        schedule: {
          with: {
            package: {
              with: {
                packageQuestions: {
                  with: { question: { with: { options: true } } },
                },
              },
            },
          },
        },
        answers: {
          with: { question: true, selectedOption: true },
        },
      },
    });
    if (!se) throw notFound("Student exam not found");
    return se;
  },

  // Input nilai manual + feedback utk soal esai
  async gradeEssays(studentExamId: string, grades: GradeEssayInput[]) {
    const se = await db.query.studentExams.findFirst({
      where: eq(studentExams.id, studentExamId),
    });
    if (!se) throw notFound("Student exam not found");
    if (se.status !== "WAITING_GRADING" && se.status !== "COMPLETED") {
      throw badRequest("Exam is not in a gradable state");
    }

    for (const g of grades) {
      await db
        .update(studentAnswers)
        .set({
          score: String(g.score),
          teacherFeedback: g.teacherFeedback ?? null,
        })
        .where(
          and(
            eq(studentAnswers.studentExamId, studentExamId),
            eq(studentAnswers.questionId, g.questionId),
          ),
        );
    }

    // Hitung ulang total skor (sum semua nilai jawaban) & update status
    return this._recalculate(studentExamId);
  },

  // Input nilai utk satu jawaban spesifik (opsional granular)
  async gradeSingleAnswer(answerId: string, score: number | string, teacherFeedback?: string) {
    const existing = await db.query.studentAnswers.findFirst({
      where: eq(studentAnswers.id, answerId),
    });
    if (!existing) throw notFound("Answer not found");

    await db
      .update(studentAnswers)
      .set({ score: String(score), teacherFeedback: teacherFeedback ?? null })
      .where(eq(studentAnswers.id, answerId));

    return this._recalculate(existing.studentExamId);
  },

  // Rekap nilai per schedule
  async recapBySchedule(scheduleId: string) {
    const rows = await db.query.studentExams.findMany({
      where: eq(studentExams.scheduleId, scheduleId),
      with: {
        student: true,
        answers: true,
      },
      orderBy: (t, { asc }) => [asc(t.studentId)],
    });

    return {
      success: true,
      data: rows.map((se) => {
        const answered = se.answers.length;
        const graded = se.answers.filter((a) => a.score != null).length;
        return {
          studentExamId: se.id,
          student: se.student
            ? { id: se.student.id, name: se.student.name, username: se.student.username }
            : null,
          attemptNumber: se.attemptNumber,
          status: se.status,
          totalScore: Number(se.totalScore ?? 0),
          answeredQuestions: answered,
          gradedAnswers: graded,
          startedAt: se.startedAt,
          submittedAt: se.submittedAt,
        };
      }),
    };
  },

  async _recalculate(studentExamId: string) {
    const answers = await db.query.studentAnswers.findMany({
      where: eq(studentAnswers.studentExamId, studentExamId),
    });

    // Cek apakah masih ada soal esai yang belum diberi nilai
    const pendingEssay = answers.some((a) => a.score == null);
    let total = 0;
    for (const a of answers) total += Number(a.score ?? 0);

    const status = pendingEssay ? "WAITING_GRADING" : "COMPLETED";
    await db
      .update(studentExams)
      .set({ totalScore: String(total), status })
      .where(eq(studentExams.id, studentExamId));

    return { success: true, data: { studentExamId, totalScore: total, status } };
  },
};