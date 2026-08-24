import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users";
import { subjects } from "./subjects";

export const teacherSubjects = pgTable(
  "teacher_subjects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueTeacherSubject: unique("unique_teacher_subject").on(t.userId, t.subjectId),
  }),
);

export type TeacherSubject = typeof teacherSubjects.$inferSelect;
export type NewTeacherSubject = typeof teacherSubjects.$inferInsert;
