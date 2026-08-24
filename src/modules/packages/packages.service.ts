import { and, eq, ilike, count, or, isNull, inArray } from "drizzle-orm";
import { Paragraph, Table } from "docx";
import { db } from "@/db";
import { examPackages, packageQuestions } from "@/db/schema";
import type { AuthUser } from "@/middleware/auth";
import { notFound, forbidden } from "@/middleware/errors";
import { getAdminIds, isVisibleToTeacher, resolveOwnerId } from "@/utils/ownership";
import {
  buildDocx,
  paragraph,
  optionParagraph,
  questionParagraph,
  slugify,
} from "@/utils/docx";

// Tipe soal yang punya pengali skor di level paket.
// POLY_CHOICE (Pilihan Ganda Berbobot) berbobot per opsi, MULTI_SELECT skor tetap 1
// (keduanya TANPA pengali).
const PENGALI_TYPES = [
  "ESSAY",
  "URAIAN_PENDEK",
  "TRUE_FALSE",
  "MCQ",
] as const;

// Bobot pengali per tipe dari paket; default 1 untuk tiap tipe dalam PENGALI_TYPES.
// POLY_CHOICE & MULTI_SELECT TIDAK masuk sini.
function resolveTypeWeights(raw: unknown): Record<string, number> {
  const m: Record<string, number> = {};
  for (const t of PENGALI_TYPES) m[t] = 1;
  if (raw && typeof raw === "object") {
    for (const t of PENGALI_TYPES) {
      const v = (raw as Record<string, unknown>)[t];
      if (v != null && Number(v) > 0) m[t] = Number(v);
    }
  }
  return m;
}

// Total nilai maksimal paket: pengali-tipe = Σ(count × pengali);
// POLY_CHOICE = Σ(max bobot opsi); MULTI_SELECT & lainnya = Σ(1).
function computeMaxScore(pkg: {
  typeScoreWeight?: unknown;
  packageQuestions?: { question: { questionType: string; options?: { scoreWeight?: string | number }[] } }[];
}): number {
  const tw = resolveTypeWeights(pkg.typeScoreWeight);
  let max = 0;
  for (const pq of pkg.packageQuestions ?? []) {
    const t = pq.question.questionType;
    if (t === "POLY_CHOICE") {
      const opts = pq.question.options ?? [];
      max += opts.reduce((mx, o) => Math.max(mx, Number(o.scoreWeight ?? 0)), 0);
    } else if ((PENGALI_TYPES as readonly string[]).includes(t)) {
      max += tw[t] ?? 1;
    } else {
      max += 1;
    }
  }
  return max;
}

export interface CreatePackageInput {
  subjectId: string;
  title: string;
  hasTimer?: boolean;
  durationMinutes?: number | null;
  passScore?: string | number;
  isRandomQuestions?: boolean;
  isRandomOptions?: boolean;
  questionIds?: string[];
  typeScoreWeight?: Record<string, number>;
  createdByUserId?: string;
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
  typeScoreWeight?: Record<string, number>;
}

export const packageService = {
  async list(
    query: { search?: string; page?: number; limit?: number },
    authUser?: AuthUser,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(10000, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.search) conditions.push(ilike(examPackages.title, `%${query.search}%`));

    // TEACHER: hanya paket milik sendiri ATAU buatan admin (global, read-only).
    if (authUser?.role === "TEACHER") {
      const adminIds = await getAdminIds();
      conditions.push(
        or(
          eq(examPackages.createdByUserId, authUser.id),
          isNull(examPackages.createdByUserId),
          inArray(examPackages.createdByUserId, adminIds),
        ),
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await db.query.examPackages.findMany({
      where,
      orderBy: (t, { desc }) => [desc(t.title)],
      limit,
      offset,
      with: {
        subject: true,
        createdByUser: { columns: { id: true, name: true } },
        packageQuestions: {
          columns: { id: true },
          with: { question: { columns: { questionType: true }, with: { options: { columns: { scoreWeight: true } } } } },
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
          maxScore: computeMaxScore({ typeScoreWeight: rest.typeScoreWeight, packageQuestions }),
          isOwnedByMe: authUser ? rest.createdByUserId === authUser.id : false,
        };
      }),
      pagination: { page, limit, total: total[0]?.value ?? 0 },
    };
  },

  async getById(id: string, authUser?: AuthUser) {
    const row = await db.query.examPackages.findFirst({
      where: eq(examPackages.id, id),
      with: {
        subject: true,
        createdByUser: { columns: { id: true, name: true } },
        packageQuestions: {
          orderBy: (t, { asc }) => [asc(t.orderNumber)],
          with: { question: { with: { options: true, topic: true } } },
        },
      },
    });
    if (!row) throw notFound("Exam package not found");
    if (authUser?.role === "TEACHER") {
      const adminIds = await getAdminIds();
      if (!isVisibleToTeacher(row.createdByUserId, authUser.id, adminIds)) {
        throw notFound("Exam package not found");
      }
    }
    return {
      ...row,
      maxScore: computeMaxScore(row),
      isOwnedByMe: authUser ? row.createdByUserId === authUser.id : false,
    };
  },

  async create(input: CreatePackageInput, authUser?: AuthUser) {
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
        typeScoreWeight: input.typeScoreWeight ?? {},
        createdByUserId: resolveOwnerId(input, authUser),
      })
      .returning();

    await this._syncQuestions(pkg!.id, input.questionIds ?? []);
    return this.getById(pkg!.id, authUser);
  },

  async update(id: string, input: UpdatePackageInput, authUser?: AuthUser) {
    const existing = await db.query.examPackages.findFirst({
      where: eq(examPackages.id, id),
    });
    if (!existing) throw notFound("Exam package not found");
    this.assertEditable(existing, authUser);

    const set: Record<string, unknown> = {};
    if (input.subjectId !== undefined) set.subjectId = input.subjectId;
    if (input.title !== undefined) set.title = input.title;
    if (input.hasTimer !== undefined) set.hasTimer = input.hasTimer;
    if (input.durationMinutes !== undefined) set.durationMinutes = input.durationMinutes;
    if (input.passScore !== undefined) set.passScore = String(input.passScore);
    if (input.isRandomQuestions !== undefined) set.isRandomQuestions = input.isRandomQuestions;
    if (input.isRandomOptions !== undefined) set.isRandomOptions = input.isRandomOptions;
    if (input.typeScoreWeight !== undefined) set.typeScoreWeight = input.typeScoreWeight;
    if (input.questionIds !== undefined) set.totalQuestions = input.questionIds.length;

    const [pkg] = await db
      .update(examPackages)
      .set(set)
      .where(eq(examPackages.id, id))
      .returning();

    if (input.questionIds) {
      await this._syncQuestions(id, input.questionIds);
    }

    return this.getById(pkg!.id, authUser);
  },

  async remove(id: string, authUser?: AuthUser) {
    const existing = await db.query.examPackages.findFirst({
      where: eq(examPackages.id, id),
    });
    if (!existing) throw notFound("Exam package not found");
    this.assertEditable(existing, authUser);
    await db.delete(examPackages).where(eq(examPackages.id, id));
    return { success: true };
  },

  // Guru hanya boleh mengubah/hapus paket buatan sendiri.
  assertEditable(
    existing: { createdByUserId: string | null },
    authUser?: AuthUser,
  ) {
    if (
      authUser?.role === "TEACHER" &&
      existing.createdByUserId !== authUser.id
    ) {
      throw forbidden("Anda hanya dapat mengubah paket buatan sendiri");
    }
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
            q.questionType === "POLY_CHOICE" && o.scoreWeight != null
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