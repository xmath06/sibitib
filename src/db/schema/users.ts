import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { classes } from "./classes";

export const RELIGIONS = [
  "ISLAM",
  "KRISTEN",
  "KATOLIK",
  "HINDU",
  "BUDDHA",
  "KONGHUCU",
  "OTHER",
] as const;
export type Religion = (typeof RELIGIONS)[number];

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", {
    enum: ["ADMIN", "TEACHER", "STUDENT"],
  })
    .notNull()
    .default("STUDENT"),
  classId: uuid("class_id").references(() => classes.id, {
    onDelete: "set null",
  }),
  religion: text("religion", { enum: RELIGIONS }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const USER_ROLES = ["ADMIN", "TEACHER", "STUDENT"] as const;
export type UserRole = (typeof USER_ROLES)[number];
