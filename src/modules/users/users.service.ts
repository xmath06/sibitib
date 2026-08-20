import { and, eq, ne, ilike, count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { UserRole, Religion } from "@/db/schema/users";
import { hashPassword } from "@/utils/password";
import { conflict, notFound } from "@/middleware/errors";

export interface CreateUserInput {
  name: string;
  username: string;
  password: string;
  role: UserRole;
  classId?: string | null;
  religion?: Religion | null;
}

export interface UpdateUserInput {
  name?: string;
  username?: string;
  password?: string;
  role?: UserRole;
  classId?: string | null;
  religion?: Religion | null;
}

export const userService = {
  async list(query: {
    search?: string;
    role?: UserRole;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(10000, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.role) conditions.push(eq(users.role, query.role));
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(ilike(users.name, pattern));
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await db.query.users.findMany({
      where,
      limit,
      offset,
    });

    const total = await db.select({ value: count() }).from(users).where(where);

    return {
      data: rows.map(({ passwordHash: _ph, ...u }) => u),
      pagination: {
        page,
        limit,
        total: total[0]?.value ?? 0,
      },
    };
  },

  async create(input: CreateUserInput) {
    const exists = await db.query.users.findFirst({
      where: eq(users.username, input.username),
    });
    if (exists) throw conflict(`Username "${input.username}" sudah digunakan`);

    const hash = await hashPassword(input.password);
    const [row] = await db
      .insert(users)
      .values({
        name: input.name,
        username: input.username,
        passwordHash: hash,
        role: input.role,
        classId: input.classId ?? null,
        religion: input.religion ?? null,
      })
      .returning();
    const { passwordHash: _ph, ...safe } = row!;
    return safe;
  },

  async update(id: string, input: UpdateUserInput) {
    const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!existing) throw notFound("User not found");

    if (input.username && input.username !== existing.username) {
      const dup = await db.query.users.findFirst({
        where: and(eq(users.username, input.username), ne(users.id, id)),
      });
      if (dup) throw conflict(`Username "${input.username}" sudah digunakan`);
    }

    const set: Record<string, unknown> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.username !== undefined) set.username = input.username;
    if (input.role !== undefined) set.role = input.role;
    if (input.classId !== undefined) set.classId = input.classId;
    if (input.religion !== undefined) set.religion = input.religion;
    if (input.password !== undefined) {
      set.passwordHash = await hashPassword(input.password);
    }

    const [row] = await db
      .update(users)
      .set(set)
      .where(eq(users.id, id))
      .returning();
    const { passwordHash: _ph, ...safe } = row!;
    return safe;
  },

  async remove(id: string) {
    const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!existing) throw notFound("User not found");
    await db.delete(users).where(eq(users.id, id));
    return { success: true };
  },
};