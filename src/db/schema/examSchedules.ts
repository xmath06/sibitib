import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { examPackages } from "./examPackages";
import { RELIGIONS } from "./users";

export const TARGET_TYPES = [
  "ALL_STUDENTS",
  "BY_CLASS",
  "BY_GRADE",
  "SPECIFIC_STUDENTS",
] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const examSchedules = pgTable("exam_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  packageId: uuid("package_id")
    .notNull()
    .references(() => examPackages.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category", {
    enum: ["EXAM", "ASSIGNMENT", "QUIZ", "PRACTICE"],
  })
    .notNull()
    .default("EXAM"),
  accessCode: text("access_code"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  showResultImmediately: boolean("show_result_immediately")
    .notNull()
    .default(true),
  scheduleStatus: text("schedule_status", {
    enum: ["SCHEDULED", "ON_GOING", "PAUSED", "ENDED"],
  })
    .notNull()
    .default("SCHEDULED"),
  timeExtensionMinutes: integer("time_extension_minutes")
    .notNull()
    .default(0),
  isActive: boolean("is_active").notNull().default(true),
  targetType: text("target_type", { enum: TARGET_TYPES })
    .notNull()
    .default("ALL_STUDENTS"),
  targetReligion: text("target_religion", { enum: RELIGIONS }),
});

export type ExamSchedule = typeof examSchedules.$inferSelect;
export type NewExamSchedule = typeof examSchedules.$inferInsert;

export const SCHEDULE_CATEGORIES = [
  "EXAM",
  "ASSIGNMENT",
  "QUIZ",
  "PRACTICE",
] as const;
export type ScheduleCategory = (typeof SCHEDULE_CATEGORIES)[number];

export const SCHEDULE_STATUSES = [
  "SCHEDULED",
  "ON_GOING",
  "PAUSED",
  "ENDED",
] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];