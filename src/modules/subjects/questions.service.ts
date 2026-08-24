import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { questions, options, topics } from "@/db/schema";
import type { QuestionType } from "@/db/schema/questions";
import type { AuthUser } from "@/middleware/auth";
import { forbidden, notFound } from "@/middleware/errors";
import { subjectService } from "./subjects.service";
import { resolveOwnerId } from "@/utils/ownership";

export interface QuestionOptionInput {
  optionText: string;
  scoreWeight?: string | number;
}

export interface CreateQuestionInput {
  topicId: string;
  questionText: string;
  questionType: QuestionType;
  minWordCount?: number;
  maxWordCount?: number;
  answerKey?: string;
  isShared?: boolean;
  options?: QuestionOptionInput[];
  createdByUserId?: string;
}

export interface UpdateQuestionInput {
  questionText?: string;
  questionType?: QuestionType;
  minWordCount?: number | null;
  maxWordCount?: number | null;
  answerKey?: string;
  isShared?: boolean;
  options?: QuestionOptionInput[];
}

export const questionService = {
  async listByTopic(topicId: string, authUser?: AuthUser) {
    const topic = await db.query.topics.findFirst({
      where: eq(topics.id, topicId),
      with: { subject: true },
    });
    if (!topic) throw notFound("Topic not found");

    // Guru hanya boleh melihat topik di mapel yang diampunya.
    if (authUser?.role === "TEACHER") {
      const teaches = await subjectService.teacherTeachesSubject(
        authUser.id,
        topic.subjectId,
      );
      if (!teaches) throw forbidden("Anda tidak mengampu mata pelajaran ini");
    }

    // ADMIN: semua soal. TEACHER: milik sendiri ATAU yang di-share guru lain.
    const where =
      authUser?.role === "TEACHER"
        ? and(
            eq(questions.topicId, topicId),
            or(
              eq(questions.createdByUserId, authUser.id),
              eq(questions.isShared, true),
            ),
          )
        : eq(questions.topicId, topicId);

    return db.query.questions.findMany({
      where,
      with: {
        options: true,
        createdByUser: { columns: { id: true, name: true } },
      },
    });
  },

  async getById(id: string, authUser?: AuthUser) {
    const row = await db.query.questions.findFirst({
      where: eq(questions.id, id),
      with: {
        options: true,
        topic: { with: { subject: true } },
        createdByUser: { columns: { id: true, name: true } },
      },
    });
    if (!row) throw notFound("Question not found");

    if (authUser?.role === "TEACHER") {
      const teaches = await subjectService.teacherTeachesSubject(
        authUser.id,
        row.topic.subjectId,
      );
      if (!teaches) throw notFound("Question not found");
      const isOwner = row.createdByUserId === authUser.id;
      if (!isOwner && !row.isShared) throw notFound("Question not found");
    }
    return row;
  },

  async create(input: CreateQuestionInput, authUser?: AuthUser) {
    const topic = await db.query.topics.findFirst({
      where: eq(topics.id, input.topicId),
      with: { subject: true },
    });
    if (!topic) throw notFound("Topic not found");

    if (authUser?.role === "TEACHER") {
      const teaches = await subjectService.teacherTeachesSubject(
        authUser.id,
        topic.subjectId,
      );
      if (!teaches) throw forbidden("Anda tidak mengampu mata pelajaran ini");
    }

    const [question] = await db
      .insert(questions)
      .values({
        topicId: input.topicId,
        createdByUserId: resolveOwnerId(input, authUser),
        isShared: input.isShared ?? false,
        questionText: input.questionText,
        questionType: input.questionType,
        minWordCount: input.minWordCount ?? 0,
        maxWordCount: input.maxWordCount ?? null,
        answerKey: input.answerKey ?? null,
      })
      .returning();

    const optionRows = await this._insertOptions(question!.id, input.options ?? []);
    return { ...question!, options: optionRows };
  },

  async update(id: string, input: UpdateQuestionInput, authUser?: AuthUser) {
    const existing = await db.query.questions.findFirst({
      where: eq(questions.id, id),
      with: { topic: { with: { subject: true } } },
    });
    if (!existing) throw notFound("Question not found");

    if (authUser?.role === "TEACHER" && existing.createdByUserId !== authUser.id) {
      throw forbidden("Anda hanya dapat mengubah soal buatan sendiri");
    }

    const set: Record<string, unknown> = {};
    if (input.questionText !== undefined) set.questionText = input.questionText;
    if (input.questionType !== undefined) set.questionType = input.questionType;
    if (input.minWordCount !== undefined) set.minWordCount = input.minWordCount ?? 0;
    if (input.maxWordCount !== undefined) set.maxWordCount = input.maxWordCount;
    if (input.answerKey !== undefined) set.answerKey = input.answerKey;
    if (input.isShared !== undefined) set.isShared = input.isShared;

    const [question] = await db
      .update(questions)
      .set(set)
      .where(eq(questions.id, id))
      .returning();

    // Jika options disertakan, replace seluruhnya (delete + insert) — simpel & konsisten.
    let optionRows: (typeof options.$inferSelect)[] = [];
    if (input.options) {
      await db.delete(options).where(eq(options.questionId, id));
      optionRows = await this._insertOptions(id, input.options);
    } else {
      optionRows = await db.query.options.findMany({
        where: eq(options.questionId, id),
      });
    }

    return { ...question!, options: optionRows };
  },

  async remove(id: string, authUser?: AuthUser) {
    const existing = await db.query.questions.findFirst({ where: eq(questions.id, id) });
    if (!existing) throw notFound("Question not found");

    if (authUser?.role === "TEACHER" && existing.createdByUserId !== authUser.id) {
      throw forbidden("Anda hanya dapat menghapus soal buatan sendiri");
    }
    await db.delete(questions).where(eq(questions.id, id));
    return { success: true };
  },

  async _insertOptions(questionId: string, opts: QuestionOptionInput[]) {
    if (!opts.length) return [];
    const rows = await db
      .insert(options)
      .values(
        opts.map((o) => ({
          questionId,
          optionText: o.optionText,
          scoreWeight: String(o.scoreWeight ?? "0"),
        })),
      )
      .returning();
    return rows;
  },
};