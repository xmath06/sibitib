import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const classes = pgTable("classes", {
  id: uuid("id").defaultRandom().primaryKey(),
  gradeLevel: integer("grade_level").notNull(),
  name: text("name").notNull(),
});

export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;