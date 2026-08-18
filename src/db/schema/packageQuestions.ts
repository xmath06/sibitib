import { integer, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { examPackages } from "./examPackages";
import { questions } from "./questions";

export const packageQuestions = pgTable(
  "package_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => examPackages.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    orderNumber: integer("order_number").notNull().default(0),
  },
  (t) => [
    // satu soal hanya boleh masuk satu paket sekali
    uniqueIndex("package_questions_pkg_q_unique").on(t.packageId, t.questionId),
  ],
);

export type PackageQuestion = typeof packageQuestions.$inferSelect;
export type NewPackageQuestion = typeof packageQuestions.$inferInsert;