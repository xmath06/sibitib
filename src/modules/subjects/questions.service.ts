import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { questions, options, topics } from "@/db/schema";
import type { QuestionType } from "@/db/schema/questions";
import { notFound } from "@/middleware/errors";

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
  options?: QuestionOptionInput[];
}

export interface UpdateQuestionInput {
  questionText?: string;
  questionType?: QuestionType;
  minWordCount?: number | null;
  maxWordCount?: number | null;
  options?: QuestionOptionInput[];
}

export const questionService = {
  async listByTopic(topicId: string) {
    const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
    if (!topic) throw notFound("Topic not found");
    return db.query.questions.findMany({
      where: eq(questions.topicId, topicId),
      with: { options: true },
    });
  },

  async getById(id: string) {
    const row = await db.query.questions.findFirst({
      where: eq(questions.id, id),
      with: { options: true, topic: { with: { subject: true } } },
    });
    if (!row) throw notFound("Question not found");
    return row;
  },

  async create(input: CreateQuestionInput) {
    const topic = await db.query.topics.findFirst({ where: eq(topics.id, input.topicId) });
    if (!topic) throw notFound("Topic not found");

    const [question] = await db
      .insert(questions)
      .values({
        topicId: input.topicId,
        questionText: input.questionText,
        questionType: input.questionType,
        minWordCount: input.minWordCount ?? 0,
        maxWordCount: input.maxWordCount ?? null,
      })
      .returning();

    const optionRows = await this._insertOptions(question!.id, input.options ?? []);
    return { ...question!, options: optionRows };
  },

  async update(id: string, input: UpdateQuestionInput) {
    const existing = await db.query.questions.findFirst({ where: eq(questions.id, id) });
    if (!existing) throw notFound("Question not found");

    const set: Record<string, unknown> = {};
    if (input.questionText !== undefined) set.questionText = input.questionText;
    if (input.questionType !== undefined) set.questionType = input.questionType;
    if (input.minWordCount !== undefined) set.minWordCount = input.minWordCount ?? 0;
    if (input.maxWordCount !== undefined) set.maxWordCount = input.maxWordCount;

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

  async remove(id: string) {
    const existing = await db.query.questions.findFirst({ where: eq(questions.id, id) });
    if (!existing) throw notFound("Question not found");
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