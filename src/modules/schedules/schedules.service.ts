import { and, eq, count, or, isNull, gt, exists, sql, inArray, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  examSchedules,
  scheduleAllocations,
  scheduleTargets,
  studentExams,
  users,
  classes,
} from "@/db/schema";
import type { ScheduleCategory, TargetType } from "@/db/schema/examSchedules";
import type { Religion } from "@/db/schema/users";
import { notFound, badRequest } from "@/middleware/errors";

export interface CreateScheduleInput {
  packageId: string;
  title: string;
  category?: ScheduleCategory;
  accessCode?: string | null;
  startTime: Date;
  endTime?: Date | null;
  showResultImmediately?: boolean;
  studentIds?: string[];
  targetType?: TargetType;
  targetReligion?: Religion | null;
  targetClassIds?: string[];
  targetGradeLevels?: number[];
}

export interface UpdateScheduleInput {
  title?: string;
  category?: ScheduleCategory;
  accessCode?: string | null;
  startTime?: Date;
  endTime?: Date | null;
  showResultImmediately?: boolean;
  isActive?: boolean;
  studentIds?: string[];
  targetType?: TargetType;
  targetReligion?: Religion | null;
  targetClassIds?: string[];
  targetGradeLevels?: number[];
}

// ===== Alokasi fleksibel (schedule_targets) =====
async function syncScheduleTargets(
  scheduleId: string,
  input: {
    targetClassIds?: string[];
    targetGradeLevels?: number[];
    studentIds?: string[];
  },
) {
  const classIds = input.targetClassIds ?? [];
  const gradeLevels = input.targetGradeLevels ?? [];
  const studentIds = input.studentIds ?? [];

  await db.delete(scheduleTargets).where(eq(scheduleTargets.scheduleId, scheduleId));

  const values: Array<typeof scheduleTargets.$inferInsert> = [];
  for (const classId of classIds) values.push({ scheduleId, targetClassId: classId });
  for (const grade of gradeLevels) values.push({ scheduleId, targetGradeLevel: grade });
  for (const studentId of studentIds) values.push({ scheduleId, targetStudentId: studentId });
  if (values.length) {
    await db.insert(scheduleTargets).values(values);
  }
}

export const scheduleService = {
  // Daftar jadwal beserta statistik siswa (untuk guru/admin)
  async list(query: {
    search?: string;
    page?: number;
    limit?: number;
    status?: (typeof examSchedules.$inferSelect)["scheduleStatus"];
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.search) conditions.push(eq(examSchedules.title, query.search));
    if (query.status) conditions.push(eq(examSchedules.scheduleStatus, query.status));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db.query.examSchedules.findMany({
      where,
      orderBy: (t, { desc }) => [desc(t.startTime)],
      limit,
      offset,
      with: {
        package: { with: { subject: true } },
        allocations: { with: { student: true } },
      },
    });
    const total = await db.select({ value: count() }).from(examSchedules).where(where);

    return {
      data: rows,
      pagination: { page, limit, total: total[0]?.value ?? 0 },
    };
  },

  async getById(id: string) {
    const row = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, id),
      with: {
        package: { with: { subject: true } },
        allocations: { with: { student: true } },
        targets: {
          with: {
            targetClass: true,
            targetStudent: true,
          },
        },
        studentExams: { with: { student: true } },
      },
    });
    if (!row) throw notFound("Schedule not found");
    return row;
  },

  async create(input: CreateScheduleInput) {
    if (input.endTime && input.startTime > input.endTime) {
      throw badRequest("startTime must be before endTime");
    }

    const [schedule] = await db
      .insert(examSchedules)
      .values({
        packageId: input.packageId,
        title: input.title,
        category: input.category ?? "EXAM",
        accessCode: input.accessCode ?? null,
        startTime: input.startTime,
        endTime: input.endTime ?? null,
        showResultImmediately: input.showResultImmediately ?? true,
        targetType: input.targetType ?? "ALL_STUDENTS",
        targetReligion: input.targetReligion ?? null,
      })
      .returning();

    await syncScheduleTargets(schedule!.id, {
      targetClassIds: input.targetClassIds,
      targetGradeLevels: input.targetGradeLevels,
      studentIds: input.studentIds,
    });
    await this.recomputeAllocations(schedule!.id);
    return this.getById(schedule!.id);
  },

  async update(id: string, input: UpdateScheduleInput) {
    const existing = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, id),
    });
    if (!existing) throw notFound("Schedule not found");

    if (input.startTime && input.endTime && input.startTime > input.endTime) {
      throw badRequest("startTime must be before endTime");
    }

    const set: Record<string, unknown> = {};
    if (input.title !== undefined) set.title = input.title;
    if (input.category !== undefined) set.category = input.category;
    if (input.accessCode !== undefined) set.accessCode = input.accessCode;
    if (input.startTime !== undefined) set.startTime = input.startTime;
    if (input.endTime !== undefined) set.endTime = input.endTime;
    if (input.showResultImmediately !== undefined)
      set.showResultImmediately = input.showResultImmediately;
    if (input.isActive !== undefined) set.isActive = input.isActive;
    if (input.targetType !== undefined) set.targetType = input.targetType;
    if (input.targetReligion !== undefined) set.targetReligion = input.targetReligion;

    if (Object.keys(set).length > 0) {
      await db
        .update(examSchedules)
        .set(set)
        .where(eq(examSchedules.id, id))
        .returning();
    }

    if (input.studentIds || input.targetClassIds || input.targetGradeLevels) {
      await syncScheduleTargets(id, {
        targetClassIds: input.targetClassIds,
        targetGradeLevels: input.targetGradeLevels,
        studentIds: input.studentIds,
      });
      await this.recomputeAllocations(id);
    }

    return this.getById(id);
  },

  async remove(id: string) {
    const existing = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, id),
    });
    if (!existing) throw notFound("Schedule not found");
    await db.delete(examSchedules).where(eq(examSchedules.id, id));
    return { success: true };
  },

  // ===== Alokasi siswa =====
  async allocateStudents(scheduleId: string, studentIds: string[]) {
    const schedule = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, scheduleId),
    });
    if (!schedule) throw notFound("Schedule not found");

    await this._syncAllocations(scheduleId, studentIds);
    return this.getById(scheduleId);
  },

  async _syncAllocations(scheduleId: string, studentIds: string[]) {
    // Hapus alokasi yang tidak ada di list (jika studentIds kosong, hapus semua)
    const existing = await db.query.scheduleAllocations.findMany({
      where: eq(scheduleAllocations.scheduleId, scheduleId),
    });
    const existingIds = new Set(existing.map((a) => a.studentId));

    const toRemove = existing.filter((a) => !studentIds.includes(a.studentId));
    const toAdd = studentIds.filter((sid) => !existingIds.has(sid));

    for (const alloc of toRemove) {
      await db.delete(scheduleAllocations).where(eq(scheduleAllocations.id, alloc.id));
    }
    if (toAdd.length) {
      await db
        .insert(scheduleAllocations)
        .values(toAdd.map((studentId) => ({ scheduleId, studentId })));
    }
  },

  // Hitung ulang alokasi siswa otomatis dari targeting (kelas / jenjang / agama).
  // Guru cukup memilih Kelas dan/atau Jenjang (+ filter Agama); siswa yang cocok
  // langsung teralokasi — tidak perlu input manual per nama siswa.
  async recomputeAllocations(scheduleId: string) {
    const sched = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, scheduleId),
      with: { targets: true },
    });
    if (!sched) throw notFound("Schedule not found");

    const targets = sched.targets ?? [];
    const classIds = targets.map((t) => t.targetClassId).filter((v): v is string => !!v);
    const gradeLevels = targets
      .map((t) => t.targetGradeLevel)
      .filter((v): v is number => v != null);
    const specificStudentIds = targets
      .map((t) => t.targetStudentId)
      .filter((v): v is string => !!v);

    let eligibleIds: string[] = [];

    if (sched.targetType === "SPECIFIC_STUDENTS") {
      eligibleIds = specificStudentIds;
    } else {
      const groupConds = [];
      if (classIds.length) groupConds.push(inArray(users.classId, classIds));
      if (gradeLevels.length) groupConds.push(inArray(classes.gradeLevel, gradeLevels));

      const where = and(
        eq(users.role, "STUDENT"),
        groupConds.length ? or(...groupConds) : undefined,
        sched.targetReligion ? eq(users.religion, sched.targetReligion) : undefined,
      );

      const rows = await db
        .select({ id: users.id })
        .from(users)
        .leftJoin(classes, eq(users.classId, classes.id))
        .where(where);

      eligibleIds = rows.map((r) => r.id);
    }

    await this._syncAllocations(scheduleId, eligibleIds);
    return eligibleIds.length;
  },
};

// ===== Jadwal yang tersedia untuk siswa (filter presisi) =====
export const studentScheduleQueries = {
  // Filter presisi jadwal aktif utk siswa login:
  // 1. is_active = true & dalam rentang waktu valid
  // 2. Agama: target_religion IS NULL ATAU target_religion = siswa.religion
  // 3. Target group:
  //    - ALL_STUDENTS
  //    - ATAU (BY_CLASS  & target_class_id = siswa.class_id)
  //    - ATAU (BY_GRADE  & target_grade_level = kelas.grade_level)
  //    - ATAU (SPECIFIC_STUDENTS & target_student_id = siswa.id)
  async getActiveSchedulesForStudent(studentId: string) {
    const now = new Date();

    // Ambil data siswa + kelas untuk kriteria filter
    const student = await db.query.users.findFirst({
      where: eq(users.id, studentId),
      with: { class: true },
    });
    if (!student) throw notFound("Student not found");

    const religion = student.religion ?? null;
    const classId = student.classId ?? null;
    const gradeLevel = student.class?.gradeLevel ?? null;

    // Kriteria 1: jadwal aktif & belum berakhir
    const activeCondition = and(
      eq(examSchedules.isActive, true),
      or(isNull(examSchedules.endTime), gt(examSchedules.endTime, now)),
    );

    // Kriteria 2: agama
    const religionCondition =
      religion === null
        ? isNull(examSchedules.targetReligion)
        : or(
            isNull(examSchedules.targetReligion),
            eq(examSchedules.targetReligion, religion),
          );

    // Kriteria 3: target group (pakai EXISTS ke schedule_targets)
    const hasTarget = (clause: Parameters<typeof and>[0]) =>
      exists(
        db
          .select({ id: sql`1` })
          .from(scheduleTargets)
          .where(
            and(
              eq(scheduleTargets.scheduleId, examSchedules.id),
              clause ?? sql`true`,
            ),
          ),
      );

    const targetCondition = or(
      // ALL_STUDENTS — tidak butuh baris schedule_targets
      eq(examSchedules.targetType, "ALL_STUDENTS"),
      // BY_CLASS
      and(
        eq(examSchedules.targetType, "BY_CLASS"),
        classId !== null
          ? hasTarget(eq(scheduleTargets.targetClassId, classId))
          : sql`false`,
      ),
      // BY_GRADE
      and(
        eq(examSchedules.targetType, "BY_GRADE"),
        gradeLevel !== null
          ? hasTarget(eq(scheduleTargets.targetGradeLevel, gradeLevel))
          : sql`false`,
      ),
      // SPECIFIC_STUDENTS
      and(
        eq(examSchedules.targetType, "SPECIFIC_STUDENTS"),
        hasTarget(eq(scheduleTargets.targetStudentId, studentId)),
      ),
    );

    // Relational query builder (db.query.*.findMany) tidak mendukung subquery
    // correlated (exists) pada tabel dasar — query dibungkus lateral join.
    // Solusi: ambil id jadwal yang lolos filter dengan plain select dulu,
    // lalu gunakan inArray untuk relasi.
    const matched = await db
      .select({ id: examSchedules.id })
      .from(examSchedules)
      .where(and(activeCondition, religionCondition, targetCondition));

    if (!matched.length) return [];

    const rows = await db.query.examSchedules.findMany({
      where: inArray(examSchedules.id, matched.map((m) => m.id)),
      orderBy: (t, { asc }) => [asc(t.startTime)],
      with: {
        package: { with: { subject: true } },
        targets: {
          with: { targetClass: true, targetStudent: true },
        },
        allocations: {
          where: eq(scheduleAllocations.studentId, studentId),
        },
        studentExams: { where: eq(studentExams.studentId, studentId) },
      },
    });

    return rows;
  },

  // Riwayat ujian/tugas milik siswa (semua status, termasuk yang sudah dinilai).
  async getHistoryForStudent(studentId: string) {
    const rows = await db.query.studentExams.findMany({
      where: eq(studentExams.studentId, studentId),
      orderBy: (t, { desc }) => [desc(t.submittedAt), desc(t.startedAt)],
      with: {
        schedule: { with: { package: { with: { subject: true } } } },
      },
    });
    return rows;
  },

  async getStudentSchedule(scheduleId: string, studentId: string) {
    const alloc = await db.query.scheduleAllocations.findFirst({
      where: and(
        eq(scheduleAllocations.scheduleId, scheduleId),
        eq(scheduleAllocations.studentId, studentId),
      ),
      with: {
        schedule: {
          with: {
            package: { with: { subject: true } },
            studentExams: { where: eq(studentExams.studentId, studentId) },
          },
        },
      },
    });
    if (!alloc) throw notFound("You are not allocated to this schedule");
    return alloc.schedule;
  },

  // Cek apakah siswa memenuhi kriteria targeting sebuah jadwal.
  // Logic identik dengan getActiveSchedulesForStudent tapi untuk 1 jadwal.
  async isStudentEligible(scheduleId: string, studentId: string) {
    const student = await db.query.users.findFirst({
      where: eq(users.id, studentId),
      with: { class: true },
    });
    if (!student) return false;

    const schedule = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, scheduleId),
      with: { targets: true },
    });
    if (!schedule) return false;

    // Kriteria 2: agama
    if (
      schedule.targetReligion !== null &&
      schedule.targetReligion !== student.religion
    ) {
      return false;
    }

    // Kriteria 3: target group
    const { targetType, targets } = schedule;
    if (targetType === "ALL_STUDENTS") return true;

    if (targetType === "BY_CLASS") {
      return (
        student.classId !== null &&
        targets.some((t) => t.targetClassId === student.classId)
      );
    }

    if (targetType === "BY_GRADE") {
      return (
        student.class?.gradeLevel !== undefined &&
        targets.some((t) => t.targetGradeLevel === student.class!.gradeLevel)
      );
    }

    if (targetType === "SPECIFIC_STUDENTS") {
      return targets.some((t) => t.targetStudentId === studentId);
    }

    return false;
  },
};