import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { options } from "./options";
import { questions } from "./questions";
import { studentExams } from "./studentExams";

export const studentAnswers = pgTable(
  "student_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentExamId: uuid("student_exam_id")
      .notNull()
      .references(() => studentExams.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    selectedOptionId: uuid("selected_option_id").references(() => options.id, {
      onDelete: "set null",
    }),
    essayAnswer: text("essay_answer"),
    wordCount: integer("word_count").notNull().default(0),
    score: numeric("score", { precision: 10, scale: 2 }),
    teacherFeedback: text("teacher_feedback"),
    isFlagged: boolean("is_flagged").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Satu jawaban per (student_exam, question, option).
    // Untuk MULTI_SELECT memungkinkan beberapa baris per question dengan option berbeda.
    uniqueIndex("student_answers_exam_question_option_unique").on(
      t.studentExamId,
      t.questionId,
      t.selectedOptionId,
    ),
  ],
);

export type StudentAnswer = typeof studentAnswers.$inferSelect;
export type NewStudentAnswer = typeof studentAnswers.$inferInsert;