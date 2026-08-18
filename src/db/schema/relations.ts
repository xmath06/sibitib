import { relations } from "drizzle-orm";
import { classes } from "./classes";
import { examPackages } from "./examPackages";
import { examSchedules } from "./examSchedules";
import { options } from "./options";
import { packageQuestions } from "./packageQuestions";
import { questions } from "./questions";
import { scheduleAllocations } from "./scheduleAllocations";
import { scheduleTargets } from "./scheduleTargets";
import { studentAnswers } from "./studentAnswers";
import { studentExams } from "./studentExams";
import { subjects } from "./subjects";
import { topics } from "./topics";
import { users } from "./users";

export const usersRelations = relations(users, ({ one, many }) => ({
  class: one(classes, {
    fields: [users.classId],
    references: [classes.id],
  }),
  allocations: many(scheduleAllocations),
  studentExams: many(studentExams),
  scheduleTargets: many(scheduleTargets),
}));

export const classesRelations = relations(classes, ({ many }) => ({
  users: many(users),
  scheduleTargets: many(scheduleTargets),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  topics: many(topics),
  packages: many(examPackages),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [topics.subjectId],
    references: [subjects.id],
  }),
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  topic: one(topics, {
    fields: [questions.topicId],
    references: [topics.id],
  }),
  options: many(options),
  answers: many(studentAnswers),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  question: one(questions, {
    fields: [options.questionId],
    references: [questions.id],
  }),
}));

export const examPackagesRelations = relations(examPackages, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [examPackages.subjectId],
    references: [subjects.id],
  }),
  packageQuestions: many(packageQuestions),
  schedules: many(examSchedules),
}));

export const packageQuestionsRelations = relations(
  packageQuestions,
  ({ one }) => ({
    package: one(examPackages, {
      fields: [packageQuestions.packageId],
      references: [examPackages.id],
    }),
    question: one(questions, {
      fields: [packageQuestions.questionId],
      references: [questions.id],
    }),
  }),
);

export const examSchedulesRelations = relations(
  examSchedules,
  ({ one, many }) => ({
    package: one(examPackages, {
      fields: [examSchedules.packageId],
      references: [examPackages.id],
    }),
    allocations: many(scheduleAllocations),
    targets: many(scheduleTargets),
    studentExams: many(studentExams),
  }),
);

export const scheduleTargetsRelations = relations(
  scheduleTargets,
  ({ one }) => ({
    schedule: one(examSchedules, {
      fields: [scheduleTargets.scheduleId],
      references: [examSchedules.id],
    }),
    targetClass: one(classes, {
      fields: [scheduleTargets.targetClassId],
      references: [classes.id],
    }),
    targetStudent: one(users, {
      fields: [scheduleTargets.targetStudentId],
      references: [users.id],
    }),
  }),
);

export const scheduleAllocationsRelations = relations(
  scheduleAllocations,
  ({ one, many }) => ({
    schedule: one(examSchedules, {
      fields: [scheduleAllocations.scheduleId],
      references: [examSchedules.id],
    }),
    student: one(users, {
      fields: [scheduleAllocations.studentId],
      references: [users.id],
    }),
    studentExams: many(studentExams),
  }),
);

export const studentExamsRelations = relations(studentExams, ({ one, many }) => ({
  allocation: one(scheduleAllocations, {
    fields: [studentExams.allocationId],
    references: [scheduleAllocations.id],
  }),
  student: one(users, {
    fields: [studentExams.studentId],
    references: [users.id],
  }),
  schedule: one(examSchedules, {
    fields: [studentExams.scheduleId],
    references: [examSchedules.id],
  }),
  answers: many(studentAnswers),
}));

export const studentAnswersRelations = relations(
  studentAnswers,
  ({ one }) => ({
    studentExam: one(studentExams, {
      fields: [studentAnswers.studentExamId],
      references: [studentExams.id],
    }),
    question: one(questions, {
      fields: [studentAnswers.questionId],
      references: [questions.id],
    }),
    selectedOption: one(options, {
      fields: [studentAnswers.selectedOptionId],
      references: [options.id],
    }),
  }),
);