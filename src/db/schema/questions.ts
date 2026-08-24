import { boolean, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { topics } from "./topics";
import { users } from "./users";

export const questions = pgTable("questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isShared: boolean("is_shared").notNull().default(false),
  questionText: text("question_text").notNull(),
  questionType: text("question_type", {
    enum: [
      "MCQ",
      "ESSAY",
      "TRUE_FALSE",
      "POLY_CHOICE",
      "MULTI_SELECT",
      "URAIAN_PENDEK",
    ],
  })
    .notNull()
    .default("MCQ"),
  minWordCount: integer("min_word_count"),
  maxWordCount: integer("max_word_count"),
  answerKey: text("answer_key"),
});

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;

export const QUESTION_TYPES = [
  "MCQ",
  "ESSAY",
  "TRUE_FALSE",
  "POLY_CHOICE",
  "MULTI_SELECT",
  "URAIAN_PENDEK",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
