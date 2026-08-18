import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  examSchedules,
  scheduleAllocations,
  studentExams,
  studentAnswers,
  packageQuestions,
} from "@/db/schema";
import { computeTimer, countWords } from "@/utils/timer";
import { shuffle } from "@/utils/misc";
import { badRequest, notFound, forbidden } from "@/middleware/errors";
import { studentScheduleQueries } from "@/modules/schedules/schedules.service";

export interface SaveAnswerInput {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  essayAnswer?: string;
  isFlagged?: boolean;
}

/**
 * Ambil student_exam utk siswa tertentu, dengan akses ke schedule + package.
 */
async function getOwnedStudentExam(studentExamId: string, studentId: string) {
  const se = await db.query.studentExams.findFirst({
    where: and(
      eq(studentExams.id, studentExamId),
      eq(studentExams.studentId, studentId),
    ),
    with: {
      schedule: { with: { package: true } },
    },
  });
  if (!se) throw notFound("Student exam not found");
  return se;
}

/** Cek apakah soal termasuk dalam paket schedule tertentu. */
async function assertQuestionInSchedule(scheduleId: string, questionId: string) {
  const schedule = await db.query.examSchedules.findFirst({
    where: eq(examSchedules.id, scheduleId),
    with: { package: { with: { packageQuestions: true } } },
  });
  if (!schedule) throw notFound("Schedule not found");
  const hasQuestion = schedule.package.packageQuestions.some(
    (pq) => pq.questionId === questionId,
  );
  if (!hasQuestion) throw badRequest("Question does not belong to this schedule");
}

export const examService = {
  /**
   * Mulai ujian: buat student_exam jika belum ada (attempt pertama),
   * atau lanjutkan attempt yang sudah IN_PROGRESS.
   * Access code (jika ada) harus cocok.
   */
  async startExam(scheduleId: string, studentId: string, accessCode?: string) {
    let allocation = await db.query.scheduleAllocations.findFirst({
      where: and(
        eq(scheduleAllocations.scheduleId, scheduleId),
        eq(scheduleAllocations.studentId, studentId),
      ),
      with: { schedule: { with: { package: true } } },
    });

    // Jika belum ada alokasi eksplisit, cek apakah siswa memenuhi
    // kriteria targeting jadwal (by class / by grade / specific).
    // Bila ya, buat alokasi otomatis.
    if (!allocation) {
      const eligible = await studentScheduleQueries.isStudentEligible(
        scheduleId,
        studentId,
      );
      if (!eligible) throw forbidden("You are not allocated to this schedule");

      const [newAlloc] = await db
        .insert(scheduleAllocations)
        .values({ scheduleId, studentId })
        .returning();
      allocation = await db.query.scheduleAllocations.findFirst({
        where: eq(scheduleAllocations.id, newAlloc!.id),
        with: { schedule: { with: { package: true } } },
      });
    }

    const schedule = allocation!.schedule;
    if (!schedule.isActive) throw badRequest("Schedule is not active");
    if (schedule.scheduleStatus === "ENDED")
      throw badRequest("Schedule has ended");

    if (schedule.accessCode) {
      if (!accessCode || accessCode !== schedule.accessCode) {
        throw badRequest("Invalid access code");
      }
    }

    // Ambil attempt terbaru utk siswa ini
    const existing = await db.query.studentExams.findMany({
      where: and(
        eq(studentExams.scheduleId, scheduleId),
        eq(studentExams.studentId, studentId),
      ),
      orderBy: (t, { desc }) => [desc(t.attemptNumber)],
      limit: 1,
    });

    if (existing[0]) {
      const se = existing[0];
      if (se.status === "IN_PROGRESS") {
        return this.getExamData(se.id, studentId);
      }
      if (se.status === "COMPLETED" || se.status === "WAITING_GRADING") {
        throw badRequest("You have already submitted this exam");
      }
    }

    // Buat attempt baru
    const nextAttempt = (existing[0]?.attemptNumber ?? 0) + 1;
    const [se] = await db
      .insert(studentExams)
      .values({
        allocationId: allocation!.id,
        studentId,
        scheduleId,
        attemptNumber: nextAttempt,
        startedAt: new Date(),
        status: "IN_PROGRESS",
      })
      .returning();

    return this.getExamData(se!.id, studentId);
  },

  /**
   * Ambil data ujian: soal (diacak jika is_random_questions), opsi
   * (diacak jika is_random_options), waktu tersisa server-side.
   * — Tidak membocorkan jawaban benar (opsi tanpa metadata benar/salah).
   */
  async getExamData(studentExamId: string, studentId: string) {
    const se = await getOwnedStudentExam(studentExamId, studentId);
    const pkg = se.schedule.package;

    // Ambil soal paket
    const pqRows = await db.query.packageQuestions.findMany({
      where: eq(packageQuestions.packageId, pkg.id),
      orderBy: (t, { asc }) => [asc(t.orderNumber)],
      with: { question: { with: { options: true } } },
    });

    // Ambil jawaban yang sudah tersimpan (untuk draft yang akan di-restore)
    const saved = await db.query.studentAnswers.findMany({
      where: eq(studentAnswers.studentExamId, studentExamId),
    });

    let questions = pqRows.map((r) => r.question);

    // Pengacakan soal
    if (pkg.isRandomQuestions) questions = shuffle(questions);

    // Pengacakan opsi
    const questionsWithShuffledOptions = questions.map((q) => ({
      ...q,
      options: pkg.isRandomOptions ? shuffle(q.options) : q.options,
    }));

    const timer = computeTimer({
      hasTimer: pkg.hasTimer,
      durationMinutes: pkg.durationMinutes,
      timeExtensionMinutes: se.schedule.timeExtensionMinutes,
      startedAt: se.startedAt,
    });

    // Peta jawaban tersimpan per pertanyaan
    const savedByQuestion = new Map<string, typeof saved>();
    for (const a of saved) {
      const list = savedByQuestion.get(a.questionId) ?? [];
      list.push(a);
      savedByQuestion.set(a.questionId, list);
    }

    return {
      success: true,
      data: {
        studentExamId: se.id,
        schedule: {
          id: se.schedule.id,
          title: se.schedule.title,
          category: se.schedule.category,
          accessCodeRequired: Boolean(se.schedule.accessCode),
          showResultImmediately: se.schedule.showResultImmediately,
          status: se.schedule.scheduleStatus,
          timeExtensionMinutes: se.schedule.timeExtensionMinutes,
        },
        package: {
          id: pkg.id,
          title: pkg.title,
          hasTimer: pkg.hasTimer,
          durationMinutes: pkg.durationMinutes,
          passScore: pkg.passScore,
          totalQuestions: questions.length,
        },
        timer,
        questions: questionsWithShuffledOptions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          minWordCount: q.minWordCount,
          maxWordCount: q.maxWordCount,
          options: q.options.map((o) => ({
            id: o.id,
            optionText: o.optionText,
          })),
          // Draft jawaban siswa (utk restore di sisi client)
          savedAnswers: (savedByQuestion.get(q.id) ?? []).map((a) => ({
            selectedOptionId: a.selectedOptionId,
            essayAnswer: a.essayAnswer,
            isFlagged: a.isFlagged,
          })),
        })),
      },
    };
  },

  /**
   * Auto-save jawaban (debounced dari client). Melakukan upsert
   * ringan per pertanyaan — tanpa mengunci baris lain.
   */
  async autosaveAnswers(studentExamId: string, studentId: string, answers: SaveAnswerInput[]) {
    const se = await getOwnedStudentExam(studentExamId, studentId);
    if (se.status !== "IN_PROGRESS") {
      throw badRequest("Exam is not in progress");
    }

    for (const a of answers) {
      await assertQuestionInSchedule(se.scheduleId, a.questionId);

      // Hapus jawaban lama utk pertanyaan ini (handle MULTI_SELECT: banyak baris)
      await db
        .delete(studentAnswers)
        .where(
          and(
            eq(studentAnswers.studentExamId, studentExamId),
            eq(studentAnswers.questionId, a.questionId),
          ),
        );

      if (a.selectedOptionIds?.length) {
        // MULTI_SELECT: satu baris per opsi terpilih
        await db.insert(studentAnswers).values(
          a.selectedOptionIds.map((optId) => ({
            studentExamId,
            questionId: a.questionId,
            selectedOptionId: optId,
            isFlagged: a.isFlagged ?? false,
            updatedAt: new Date(),
          })),
        );
      } else if (a.selectedOptionId) {
        await db.insert(studentAnswers).values({
          studentExamId,
          questionId: a.questionId,
          selectedOptionId: a.selectedOptionId,
          isFlagged: a.isFlagged ?? false,
          updatedAt: new Date(),
        });
      } else if (a.essayAnswer !== undefined) {
        await db.insert(studentAnswers).values({
          studentExamId,
          questionId: a.questionId,
          essayAnswer: a.essayAnswer,
          wordCount: countWords(a.essayAnswer),
          isFlagged: a.isFlagged ?? false,
          updatedAt: new Date(),
        });
      }
    }

    // Touch: update timestamp biar rekap tahu ada aktivitas terbaru
    await db
      .update(studentExams)
      .set({ status: "IN_PROGRESS" })
      .where(eq(studentExams.id, studentExamId));

    return { success: true, saved: answers.length };
  },

  /**
   * Submit ujian + auto-grading pilihan ganda (MCQ / TRUE_FALSE /
   * POLY_CHOICE / MULTI_SELECT) berdasarkan score_weight opsi.
   * Soal ESSAY -> WAITING_GRADING (dinilai guru manual).
   */
  async submitExam(studentExamId: string, studentId: string) {
    const se = await getOwnedStudentExam(studentExamId, studentId);
    if (se.status !== "IN_PROGRESS") {
      throw badRequest("Exam is not currently in progress");
    }

    // Ambil semua jawaban + soal + opsi (utk auto-grading)
    const answers = await db.query.studentAnswers.findMany({
      where: eq(studentAnswers.studentExamId, studentExamId),
      with: {
        question: true,
        selectedOption: true,
      },
    });

    const pkg = se.schedule.package;

    // Hitung otomatis untuk tipe pilihan
    let totalScore = 0;
    let hasEssay = false;

    for (const a of answers) {
      const type = a.question.questionType;

      if (type === "ESSAY") {
        hasEssay = true;
        // Batas kata hanya informasi/warning — jangan blokir submit.
        continue;
      }

      // Auto-grading: bobot opsi terpilih
      const weight = a.selectedOption ? Number(a.selectedOption.scoreWeight) : 0;
      totalScore += weight;
      await db
        .update(studentAnswers)
        .set({ score: String(weight) })
        .where(eq(studentAnswers.id, a.id));
    }

    const finalStatus = hasEssay ? "WAITING_GRADING" : "COMPLETED";

    const [updated] = await db
      .update(studentExams)
      .set({
        submittedAt: new Date(),
        totalScore: String(totalScore),
        status: finalStatus,
      })
      .where(eq(studentExams.id, studentExamId))
      .returning();

    // Tandai schedule sebagai ENDED jika semua siswa sudah submit (opsional)
    await this._maybeEndSchedule(se.scheduleId);

    const result = {
      studentExamId,
      status: finalStatus,
      totalScore,
      hasEssay,
      showResultImmediately: se.schedule.showResultImmediately,
      passScore: pkg.passScore,
      passed: pkg.passScore != null ? totalScore >= Number(pkg.passScore) : null,
    };

    // Jika guru menutup akses hasil langsung, jangan kirim skor utk yang WAITING_GRADING
    if (finalStatus === "WAITING_GRADING") {
      return { success: true, data: { ...result, totalScore: null, passed: null } };
    }
    return { success: true, data: result };
  },

  /** Hasil ujian utk siswa (setelah selesai). */
  async getResult(studentExamId: string, studentId: string) {
    const se = await getOwnedStudentExam(studentExamId, studentId);
    if (se.status === "NOT_STARTED" || se.status === "IN_PROGRESS") {
      throw badRequest("Exam has not been submitted yet");
    }
    const pkg = se.schedule.package;

    return {
      success: true,
      data: {
        studentExamId: se.id,
        attemptNumber: se.attemptNumber,
        status: se.status,
        totalScore: Number(se.totalScore ?? 0),
        submittedAt: se.submittedAt,
        passed:
          pkg.passScore != null ? Number(se.totalScore ?? 0) >= Number(pkg.passScore) : null,
        showResultImmediately: se.schedule.showResultImmediately,
        answers: await db.query.studentAnswers.findMany({
          where: eq(studentAnswers.studentExamId, studentExamId),
          with: { question: true, selectedOption: true },
        }),
      },
    };
  },

  async _maybeEndSchedule(scheduleId: string) {
    const schedule = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, scheduleId),
    });
    if (!schedule || schedule.scheduleStatus === "ENDED") return;

    const allocs = await db.query.scheduleAllocations.findMany({
      where: eq(scheduleAllocations.scheduleId, scheduleId),
    });
    if (!allocs.length) return;

    const studentIds = allocs.map((a) => a.studentId);
    const submitted = await db.query.studentExams.findMany({
      where: and(
        eq(studentExams.scheduleId, scheduleId),
        inArray(studentExams.studentId, studentIds),
        // status yang menandakan selesai
      ),
    });

    const allDone = studentIds.every((sid) =>
      submitted.some(
        (se) =>
          se.studentId === sid &&
          (se.status === "COMPLETED" || se.status === "WAITING_GRADING"),
      ),
    );

    if (allDone) {
      await db
        .update(examSchedules)
        .set({ scheduleStatus: "ENDED" })
        .where(eq(examSchedules.id, scheduleId));
    }
  },
};