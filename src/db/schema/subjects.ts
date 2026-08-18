import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { Religion } from "./users";

export const subjects = pgTable("subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  religion: text("religion").$type<Religion | null>(),
});

export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;