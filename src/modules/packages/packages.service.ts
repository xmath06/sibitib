import { and, eq, ilike, count } from "drizzle-orm";
import { db } from "@/db";
import { examPackages, packageQuestions } from "@/db/schema";
import { notFound } from "@/middleware/errors";

export interface CreatePackageInput {
  subjectId: string;
  title: string;
  hasTimer?: boolean;
  durationMinutes?: number | null;
  passScore?: string | number;
  isRandomQuestions?: boolean;
  isRandomOptions?: boolean;
  questionIds?: string[];
}

export interface UpdatePackageInput {
  subjectId?: string;
  title?: string;
  hasTimer?: boolean;
  durationMinutes?: number | null;
  passScore?: string | number;
  isRandomQuestions?: boolean;
  isRandomOptions?: boolean;
  questionIds?: string[];
}

export const packageService = {
  async list(query: { search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const where = query.search ? ilike(examPackages.title, `%${query.search}%`) : undefined;
    const rows = await db.query.examPackages.findMany({
      where,
      orderBy: (t, { desc }) => [desc(t.title)],
      limit,
      offset,
      with: { subject: true, packageQuestions: { columns: { id: true } } },
    });
    const total = await db
      .select({ value: count() })
      .from(examPackages)
      .where(where);

    return {
      data: rows.map(({ packageQuestions, ...rest }) => ({
        ...rest,
        questionCount: packageQuestions.length,
      })),
      pagination: { page, limit, total: total[0]?.value ?? 0 },
    };
  },

  async getById(id: string) {
    const row = await db.query.examPackages.findFirst({
      where: eq(examPackages.id, id),
      with: {
        subject: true,
        packageQuestions: {
          orderBy: (t, { asc }) => [asc(t.orderNumber)],
          with: { question: { with: { options: true, topic: true } } },
        },
      },
    });
    if (!row) throw notFound("Exam package not found");
    return row;
  },

  async create(input: CreatePackageInput) {
    const qty = input.questionIds?.length ?? 0;

    const [pkg] = await db
      .insert(examPackages)
      .values({
        subjectId: input.subjectId,
        title: input.title,
        hasTimer: input.hasTimer ?? true,
        durationMinutes: input.durationMinutes ?? null,
        passScore: input.passScore !== undefined ? String(input.passScore) : "0",
        totalQuestions: qty,
        isRandomQuestions: input.isRandomQuestions ?? false,
        isRandomOptions: input.isRandomOptions ?? false,
      })
      .returning();

    await this._syncQuestions(pkg!.id, input.questionIds ?? []);
    return this.getById(pkg!.id);
  },

  async update(id: string, input: UpdatePackageInput) {
    const existing = await db.query.examPackages.findFirst({
      where: eq(examPackages.id, id),
    });
    if (!existing) throw notFound("Exam package not found");

    const set: Record<string, unknown> = {};
    if (input.subjectId !== undefined) set.subjectId = input.subjectId;
    if (input.title !== undefined) set.title = input.title;
    if (input.hasTimer !== undefined) set.hasTimer = input.hasTimer;
    if (input.durationMinutes !== undefined) set.durationMinutes = input.durationMinutes;
    if (input.passScore !== undefined) set.passScore = String(input.passScore);
    if (input.isRandomQuestions !== undefined) set.isRandomQuestions = input.isRandomQuestions;
    if (input.isRandomOptions !== undefined) set.isRandomOptions = input.isRandomOptions;
    if (input.questionIds !== undefined) set.totalQuestions = input.questionIds.length;

    const [pkg] = await db
      .update(examPackages)
      .set(set)
      .where(eq(examPackages.id, id))
      .returning();

    if (input.questionIds) {
      await this._syncQuestions(id, input.questionIds);
    }

    return this.getById(pkg!.id);
  },

  async remove(id: string) {
    const existing = await db.query.examPackages.findFirst({
      where: eq(examPackages.id, id),
    });
    if (!existing) throw notFound("Exam package not found");
    await db.delete(examPackages).where(eq(examPackages.id, id));
    return { success: true };
  },

  // Replace seluruh daftar soal paket (delete + insert) dgn orderNumber berurutan.
  async _syncQuestions(packageId: string, questionIds: string[]) {
    await db.delete(packageQuestions).where(eq(packageQuestions.packageId, packageId));
    if (!questionIds.length) return;
    await db
      .insert(packageQuestions)
      .values(
        questionIds.map((qid, idx) => ({
          packageId,
          questionId: qid,
          orderNumber: idx + 1,
        })),
      );
  },
};