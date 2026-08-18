import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { User } from "@/db/schema/users";
import { hashPassword, verifyPassword } from "@/utils/password";
import { unauthorized, notFound } from "@/middleware/errors";

export type SafeUser = Omit<User, "passwordHash">;

export const toSafeUser = (u: User): SafeUser => {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
};

export const authService = {
  async login(username: string, password: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
    });
    if (!user) throw unauthorized("Invalid username or password");

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw unauthorized("Invalid username or password");

    return user;
  },

  async getUserById(id: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) throw notFound("User not found");
    return user;
  },

  async registerAdmin() {
    // Endpoint internal untuk memastikan admin pertama ada (opsional)
    const existing = await db.query.users.findFirst({
      where: eq(users.username, "admin"),
    });
    if (existing) return existing;
    const hash = await hashPassword("admin123");
    const [row] = await db
      .insert(users)
      .values({
        name: "Administrator",
        username: "admin",
        passwordHash: hash,
        role: "ADMIN",
      })
      .returning();
    return row;
  },

  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const user = await this.getUserById(id);
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw unauthorized("Current password is incorrect");
    const hash = await hashPassword(newPassword);
    const [updated] = await db
      .update(users)
      .set({ passwordHash: hash })
      .where(eq(users.id, id))
      .returning();
    return updated;
  },

  async usernameExists(username: string): Promise<boolean> {
    const row = await db.query.users.findFirst({
      where: eq(users.username, username),
    });
    return Boolean(row);
  },
};