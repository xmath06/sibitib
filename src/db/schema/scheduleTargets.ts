import { integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { classes } from "./classes";
import { examSchedules } from "./examSchedules";
import { users } from "./users";

// Target alokasi fleksibel: sebuah jadwal bisa menyasar ke kelas, grade, atau
// siswa tertentu. Baris-baris ini digabung (OR) oleh query siswa.
export const scheduleTargets = pgTable("schedule_targets", {
  id: uuid("id").defaultRandom().primaryKey(),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => examSchedules.id, { onDelete: "cascade" }),
  targetClassId: uuid("target_class_id").references(() => classes.id, {
    onDelete: "set null",
  }),
  targetGradeLevel: integer("target_grade_level"),
  targetStudentId: uuid("target_student_id").references(() => users.id, {
    onDelete: "set null",
  }),
});

export type ScheduleTarget = typeof scheduleTargets.$inferSelect;
export type NewScheduleTarget = typeof scheduleTargets.$inferInsert;