import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { subjects } from "./subjects";

export const examPackages = pgTable("exam_packages", {
  id: uuid("id").defaultRandom().primaryKey(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  hasTimer: boolean("has_timer").notNull().default(true),
  durationMinutes: integer("duration_minutes"),
  passScore: numeric("pass_score", { precision: 10, scale: 2 }).default("0"),
  totalQuestions: integer("total_questions").notNull().default(0),
  isRandomQuestions: boolean("is_random_questions").notNull().default(false),
  isRandomOptions: boolean("is_random_options").notNull().default(false),
});

export type ExamPackage = typeof examPackages.$inferSelect;
export type NewExamPackage = typeof examPackages.$inferInsert;