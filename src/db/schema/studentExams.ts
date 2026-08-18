import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { examSchedules } from "./examSchedules";
import { scheduleAllocations } from "./scheduleAllocations";
import { users } from "./users";

export const studentExams = pgTable("student_exams", {
  id: uuid("id").defaultRandom().primaryKey(),
  allocationId: uuid("allocation_id")
    .notNull()
    .references(() => scheduleAllocations.id, { onDelete: "cascade" }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => examSchedules.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  totalScore: numeric("total_score", { precision: 10, scale: 2 }).default("0"),
  status: text("status", {
    enum: ["NOT_STARTED", "IN_PROGRESS", "WAITING_GRADING", "COMPLETED"],
  })
    .notNull()
    .default("NOT_STARTED"),
});

export type StudentExam = typeof studentExams.$inferSelect;
export type NewStudentExam = typeof studentExams.$inferInsert;

export const STUDENT_EXAM_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "WAITING_GRADING",
  "COMPLETED",
] as const;
export type StudentExamStatus = (typeof STUDENT_EXAM_STATUSES)[number];