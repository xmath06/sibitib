import { and, eq, ilike, count } from "drizzle-orm";
import { db } from "@/db";
import { subjects, topics } from "@/db/schema";
import type { Religion } from "@/db/schema/users";
import { conflict, notFound } from "@/middleware/errors";

export interface CreateSubjectInput {
  code: string;
  name: string;
  religion?: Religion | null;
}

export interface UpdateSubjectInput {
  code?: string;
  name?: string;
  religion?: Religion | null;
}

export const subjectService = {
  async list(query: { search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const offset = (page - 1) * limit;

    const where = query.search ? ilike(subjects.name, `%${query.search}%`) : undefined;
    const rows = await db.query.subjects.findMany({
      where,
      orderBy: (t, { asc }) => [asc(t.code)],
      limit,
      offset,
      with: { topics: true },
    });
    const total = await db.select({ value: count() }).from(subjects).where(where);

    return { data: rows, pagination: { page, limit, total: total[0]?.value ?? 0 } };
  },

  async getById(id: string) {
    const row = await db.query.subjects.findFirst({
      where: eq(subjects.id, id),
      with: {
        topics: {
          with: { questions: { with: { options: true } } },
        },
      },
    });
    if (!row) throw notFound("Subject not found");
    return row;
  },

  async create(input: CreateSubjectInput) {
    const dup = await db.query.subjects.findFirst({
      where: eq(subjects.code, input.code),
    });
    if (dup) throw conflict("Subject code already exists");
    const [row] = await db.insert(subjects).values(input).returning();
    return row!;
  },

  async update(id: string, input: UpdateSubjectInput) {
    const existing = await db.query.subjects.findFirst({ where: eq(subjects.id, id) });
    if (!existing) throw notFound("Subject not found");

    if (input.code && input.code !== existing.code) {
      const dup = await db.query.subjects.findFirst({
        where: eq(subjects.code, input.code),
      });
      if (dup) throw conflict("Subject code already exists");
    }

    const set: Record<string, unknown> = {};
    if (input.code !== undefined) set.code = input.code;
    if (input.name !== undefined) set.name = input.name;
    if (input.religion !== undefined) set.religion = input.religion;

    const [row] = await db.update(subjects).set(set).where(eq(subjects.id, id)).returning();
    return row!;
  },

  async remove(id: string) {
    const existing = await db.query.subjects.findFirst({ where: eq(subjects.id, id) });
    if (!existing) throw notFound("Subject not found");
    await db.delete(subjects).where(eq(subjects.id, id));
    return { success: true };
  },
};

// ===== Topics =====
export const topicService = {
  async create(subjectId: string, name: string) {
    const subj = await db.query.subjects.findFirst({ where: eq(subjects.id, subjectId) });
    if (!subj) throw notFound("Subject not found");
    const [row] = await db.insert(topics).values({ subjectId, name }).returning();
    return row!;
  },

  async update(id: string, name: string) {
    const existing = await db.query.topics.findFirst({ where: eq(topics.id, id) });
    if (!existing) throw notFound("Topic not found");
    const [row] = await db.update(topics).set({ name }).where(eq(topics.id, id)).returning();
    return row!;
  },

  async remove(id: string) {
    const existing = await db.query.topics.findFirst({ where: eq(topics.id, id) });
    if (!existing) throw notFound("Topic not found");
    await db.delete(topics).where(eq(topics.id, id));
    return { success: true };
  },

  async listBySubject(subjectId: string) {
    return db.query.topics.findMany({
      where: and(eq(topics.subjectId, subjectId)),
      orderBy: (t, { asc }) => [asc(t.name)],
      with: { questions: { with: { options: true } } },
    });
  },
};