import { and, eq, ilike, count, inArray } from "drizzle-orm";
import { db } from "@/db";
import { subjects, topics, teacherSubjects } from "@/db/schema";
import type { Religion } from "@/db/schema/users";
import type { AuthUser } from "@/middleware/auth";
import { conflict, forbidden, notFound } from "@/middleware/errors";

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
  // Cek apakah seorang guru mengampu subject tertentu.
  async teacherTeachesSubject(userId: string, subjectId: string): Promise<boolean> {
    const row = await db.query.teacherSubjects.findFirst({
      where: and(
        eq(teacherSubjects.userId, userId),
        eq(teacherSubjects.subjectId, subjectId),
      ),
    });
    return !!row;
  },

  // Kembalikan daftar subjectId yang diampu guru (kosong untuk non-teacher).
  async listTeacherSubjectIds(userId: string): Promise<string[]> {
    const rows = await db.query.teacherSubjects.findMany({
      where: eq(teacherSubjects.userId, userId),
      columns: { subjectId: true },
    });
    return rows.map((r) => r.subjectId);
  },

  async list(query: {
    search?: string;
    page?: number;
    limit?: number;
    authUser?: AuthUser;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(10000, Math.max(1, query.limit ?? 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.search) conditions.push(ilike(subjects.name, `%${query.search}%`));

    // TEACHER hanya melihat subject yang diampu.
    if (query.authUser && query.authUser.role === "TEACHER") {
      const ids = await this.listTeacherSubjectIds(query.authUser.id);
      if (ids.length === 0) {
        return { data: [], pagination: { page, limit, total: 0 } };
      }
      conditions.push(inArray(subjects.id, ids));
    }

    const where = conditions.length ? and(...conditions) : undefined;
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
  async assertTeacherCanManage(userId: string, subjectId: string) {
    const ok = await subjectService.teacherTeachesSubject(userId, subjectId);
    if (!ok) throw forbidden("Anda tidak mengampu mata pelajaran ini");
  },

  async create(subjectId: string, name: string, authUser?: AuthUser) {
    const subj = await db.query.subjects.findFirst({ where: eq(subjects.id, subjectId) });
    if (!subj) throw notFound("Subject not found");
    if (authUser?.role === "TEACHER") {
      await this.assertTeacherCanManage(authUser.id, subjectId);
    }
    const [row] = await db
      .insert(topics)
      .values({ subjectId, name, createdByUserId: authUser!.id })
      .returning();
    return row!;
  },

  async update(id: string, name: string, authUser?: AuthUser) {
    const existing = await db.query.topics.findFirst({ where: eq(topics.id, id) });
    if (!existing) throw notFound("Topic not found");
    if (authUser?.role === "TEACHER") {
      await this.assertTeacherCanManage(authUser.id, existing.subjectId);
    }
    const [row] = await db.update(topics).set({ name }).where(eq(topics.id, id)).returning();
    return row!;
  },

  async remove(id: string, authUser?: AuthUser) {
    const existing = await db.query.topics.findFirst({ where: eq(topics.id, id) });
    if (!existing) throw notFound("Topic not found");
    if (authUser?.role === "TEACHER") {
      await this.assertTeacherCanManage(authUser.id, existing.subjectId);
    }
    await db.delete(topics).where(eq(topics.id, id));
    return { success: true };
  },

  async listBySubject(subjectId: string, authUser?: AuthUser) {
    const subj = await db.query.subjects.findFirst({ where: eq(subjects.id, subjectId) });
    if (!subj) throw notFound("Subject not found");
    if (authUser?.role === "TEACHER") {
      await this.assertTeacherCanManage(authUser.id, subjectId);
    }

    const rows = await db.query.topics.findMany({
      where: and(eq(topics.subjectId, subjectId)),
      orderBy: (t, { asc }) => [asc(t.name)],
      with: {
        questions: {
          columns: { id: true, createdByUserId: true, isShared: true },
        },
        createdByUser: { columns: { id: true, name: true } },
      },
    });

    return rows.map((t) => {
      const ownCount = t.questions.filter(
        (q) => authUser && q.createdByUserId === authUser.id,
      ).length;
      const sharedCount = t.questions.filter(
        (q) => q.isShared && q.createdByUserId !== (authUser?.id ?? ""),
      ).length;
      return {
        ...t,
        ownQuestionCount: ownCount,
        sharedQuestionCount: sharedCount,
        isOwnedByMe: !!authUser && t.createdByUserId === authUser.id,
      };
    });
  },
};