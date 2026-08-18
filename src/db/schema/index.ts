import * as relations from "./relations";
import { users } from "./users";
import { classes } from "./classes";
import { subjects } from "./subjects";
import { topics } from "./topics";
import { questions } from "./questions";
import { options } from "./options";
import { examPackages } from "./examPackages";
import { packageQuestions } from "./packageQuestions";
import { examSchedules } from "./examSchedules";
import { scheduleAllocations } from "./scheduleAllocations";
import { scheduleTargets } from "./scheduleTargets";
import { studentExams } from "./studentExams";
import { studentAnswers } from "./studentAnswers";

export {
  users,
  classes,
  subjects,
  topics,
  questions,
  options,
  examPackages,
  packageQuestions,
  examSchedules,
  scheduleAllocations,
  scheduleTargets,
  studentExams,
  studentAnswers,
};

export * from "./users";
export * from "./classes";
export * from "./subjects";
export * from "./topics";
export * from "./questions";
export * from "./options";
export * from "./examPackages";
export * from "./packageQuestions";
export * from "./examSchedules";
export * from "./scheduleAllocations";
export * from "./scheduleTargets";
export * from "./studentExams";
export * from "./studentAnswers";
export * from "./relations";

export const schema = {
  users,
  classes,
  subjects,
  topics,
  questions,
  options,
  examPackages,
  packageQuestions,
  examSchedules,
  scheduleAllocations,
  scheduleTargets,
  studentExams,
  studentAnswers,
  ...relations,
};