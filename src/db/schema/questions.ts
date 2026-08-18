import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { topics } from "./topics";

export const questions = pgTable("questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  questionType: text("question_type", {
    enum: ["MCQ", "ESSAY", "TRUE_FALSE", "POLY_CHOICE", "MULTI_SELECT"],
  })
    .notNull()
    .default("MCQ"),
  minWordCount: integer("min_word_count"),
  maxWordCount: integer("max_word_count"),
});

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;

export const QUESTION_TYPES = [
  "MCQ",
  "ESSAY",
  "TRUE_FALSE",
  "POLY_CHOICE",
  "MULTI_SELECT",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
