import { and, eq, ilike, count } from "drizzle-orm";
import { Paragraph, Table } from "docx";
import { db } from "@/db";
import { examPackages, packageQuestions } from "@/db/schema";
import { notFound } from "@/middleware/errors";
import {
  buildDocx,
  paragraph,
  optionParagraph,
  questionParagraph,
  slugify,
} from "@/utils/docx";

// Total nilai maksimal paket = Σ poin tiap soal di dalam paket.
function computeMaxScore(pkg: { packageQuestions?: unknown } & Record<string, unknown>): number {
  const pqs = (pkg.packageQuestions ?? []) as { score?: string | number }[];
  let max = 0;
  for (const pq of pqs) max += Number(pq.score ?? 1);
  return max;
}

export interface PackageQuestionInput {
  questionId: string;
  score?: number;
}

// Soal paket bisa diberikan via `questions` (dgn poin) atau `questionIds` (fallback poin=1).
function toQuestionInputs(input: {
  questions?: PackageQuestionInput[];
  questionIds?: string[];
}): PackageQuestionInput[] {
  if (input.questions && input.questions.length) return input.questions;
  if (input.questionIds) return input.questionIds.map((qid) => ({ questionId: qid, score: 1 }));
  return [];
}

export interface CreatePackageInput {
  subjectId: string;
  title: string;
  hasTimer?: boolean;
  durationMinutes?: number | null;
  passScore?: string | number;
  isRandomQuestions?: boolean;
  isRandomOptions?: boolean;
  questions?: PackageQuestionInput[];
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
  questions?: PackageQuestionInput[];
  questionIds?: string[];
}

export const packageService = {
  async list(query: { search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(10000, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const where = query.search ? ilike(examPackages.title, `%${query.search}%`) : undefined;
    const rows = await db.query.examPackages.findMany({
      where,
      orderBy: (t, { desc }) => [desc(t.title)],
      limit,
      offset,
      with: {
        subject: true,
        packageQuestions: {
          columns: { id: true, score: true },
          with: { question: { columns: { questionType: true } } },
        },
      },
    });
    const total = await db
      .select({ value: count() })
      .from(examPackages)
      .where(where);

    return {
      data: rows.map(({ packageQuestions, ...rest }) => {
        const typeCounts: Record<string, number> = {};
        for (const pq of packageQuestions) {
          const t = pq.question.questionType;
          typeCounts[t] = (typeCounts[t] ?? 0) + 1;
        }
        return {
          ...rest,
          questionCount: packageQuestions.length,
          questionTypeCounts: typeCounts,
          maxScore: computeMaxScore({ packageQuestions }),
        };
      }),
      pagination: { page, limit, total: total[0]?.value ?? 0 },
    };
  },

  async getById(id: string) {
    const row = await db.query.examPackages.findFirst({
      where: eq(examPackages.id, id),
      with: {
        subject: true,
        packageQuestions: {
          columns: { score: true },
          orderBy: (t, { asc }) => [asc(t.orderNumber)],
          with: { question: { with: { options: true, topic: true } } },
        },
      },
    });
    if (!row) throw notFound("Exam package not found");
    return { ...row, maxScore: computeMaxScore(row) };
  },

  async create(input: CreatePackageInput) {
    const qInputs = toQuestionInputs(input);
    const qty = qInputs.length;

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

    await this._syncQuestions(pkg!.id, qInputs);
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

    const [pkg] = await db
      .update(examPackages)
      .set(set)
      .where(eq(examPackages.id, id))
      .returning();

    if (input.questions !== undefined || input.questionIds !== undefined) {
      const qInputs = toQuestionInputs(input);
      await db.update(examPackages).set({ totalQuestions: qInputs.length }).where(eq(examPackages.id, id));
      await this._syncQuestions(id, qInputs);
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

  async exportDocx(id: string): Promise<{ buffer: Uint8Array; filename: string }> {
    const pkg = await this.getById(id);

    const children: (Paragraph | Table)[] = [];
    children.push(paragraph("PAKET SOAL", { bold: true, align: "center" }));
    children.push(
      paragraph(`${pkg.subject?.code ?? ""} - ${pkg.subject?.name ?? ""}`, { align: "center" }),
    );
    children.push(paragraph(pkg.title, { bold: true, align: "center" }));
    children.push(
      paragraph(
        `Jumlah soal: ${pkg.packageQuestions.length} | Durasi: ${pkg.durationMinutes ?? "tanpa batas"} menit | Pass: ${pkg.passScore ?? "-"}`,
      ),
    );
    children.push(paragraph(""));

    pkg.packageQuestions.forEach((pq, idx) => {
      const q = pq.question;
      children.push(questionParagraph(idx + 1, q.questionText));
      children.push(paragraph(`   Poin: ${Number(pq.score ?? 1)}`));

      if (q.questionType === "ESSAY") {
        children.push(paragraph("   Jawaban:"));
        if (q.minWordCount || q.maxWordCount) {
          children.push(
            paragraph(`   Batas kata: ${q.minWordCount ?? 0} - ${q.maxWordCount ?? "∞"}`),
          );
        }
      } else {
        q.options.forEach((o, oi) => {
          const letter = String.fromCharCode(65 + oi);
          const detail =
            (q.questionType === "POLY_CHOICE" || q.questionType === "MULTI_SELECT") &&
            o.scoreWeight != null
              ? `  (bobot ${o.scoreWeight})`
              : "";
          children.push(optionParagraph(letter, o.optionText, detail));
        });

        if (q.questionType === "MULTI_SELECT") {
          const keys = q.options
            .map((o, oi) => (Number(o.scoreWeight ?? 0) > 0 ? String.fromCharCode(65 + oi) : ""))
            .filter(Boolean);
          if (keys.length) children.push(paragraph(`   Kunci: ${keys.join(", ")}`));
        } else {
          const keyIdx = q.options.findIndex((o) => Number(o.scoreWeight ?? 0) > 0);
          if (keyIdx >= 0) children.push(paragraph(`   Kunci: ${String.fromCharCode(65 + keyIdx)}`));
        }
      }
    });

    const buffer = await buildDocx(children, { title: `Paket Soal - ${pkg.title}` });
    return { buffer, filename: `paket-${slugify(pkg.title)}.docx` };
  },

  // Replace seluruh daftar soal paket (delete + insert) dgn orderNumber + poin.
  async _syncQuestions(packageId: string, questions: PackageQuestionInput[]) {
    await db.delete(packageQuestions).where(eq(packageQuestions.packageId, packageId));
    if (!questions.length) return;
    await db.insert(packageQuestions).values(
      questions.map((q, idx) => ({
        packageId,
        questionId: q.questionId,
        orderNumber: idx + 1,
        score: q.score != null ? String(q.score) : "1",
      })),
    );
  },
};