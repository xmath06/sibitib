import { pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { examSchedules } from "./examSchedules";
import { users } from "./users";

export const scheduleAllocations = pgTable(
  "schedule_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => examSchedules.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("schedule_allocations_schedule_student_unique").on(
      t.scheduleId,
      t.studentId,
    ),
  ],
);

export type ScheduleAllocation = typeof scheduleAllocations.$inferSelect;
export type NewScheduleAllocation = typeof scheduleAllocations.$inferInsert;