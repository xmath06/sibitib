import { numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { questions } from "./questions";

export const options = pgTable("options", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  optionText: text("option_text").notNull(),
  scoreWeight: numeric("score_weight", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
});

export type Option = typeof options.$inferSelect;
export type NewOption = typeof options.$inferInsert;