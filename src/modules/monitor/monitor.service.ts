import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  examSchedules,
  scheduleAllocations,
  studentExams,
} from "@/db/schema";
import type { AuthUser } from "@/middleware/auth";
import { computeTimer } from "@/utils/timer";
import { notFound, forbidden } from "@/middleware/errors";
import { getAdminIds, isVisibleToTeacher } from "@/utils/ownership";

export interface MonitorStatus {
  scheduleId: string;
  title: string;
  category: string;
  scheduleStatus: string;
  isActive: boolean;
  hasTimer: boolean;
  durationMinutes: number | null;
  timeExtensionMinutes: number;
  totalAllocated: number;
  startedCount: number;
  submittedCount: number;
  inProgressCount: number;
  remainingSeconds: number | null;
  elapsedSeconds: number | null;
  totalSeconds: number | null;
  deadlineAt: number | null;
  classroomClock: {
    anchorAt: number | null;
    remainingSeconds: number | null;
    elapsedSeconds: number | null;
    started: boolean;
  };
  motivation: string;
  updatedAt: string;
}

const DEFAULT_MOTIVATIONS = [
  "Tetap fokus, kalian pasti bisa! 🚀",
  "Baca soal dengan teliti sebelum menjawab.",
  "Jangan lupa periksa kembali jawabanmu.",
  "Sekali usaha, selamanya bangga.",
];

// Motivasi per-schedule disimpan in-memory (utk demo/kelas kecil).
// Untuk multi-instance, pindahkan ke tabel/Redis.
const motivationStore = new Map<string, string>();

export const monitorService = {
  /**
   * Status lengkap utk layar proyektor (SSE / polling).
   * Hitungan timer: berdasarkan attempt paling awal siswa yg sudah mulai.
   */
  async getStatus(scheduleId: string, authUser?: AuthUser): Promise<MonitorStatus> {
    await this.assertVisible(scheduleId, authUser);
    const schedule = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, scheduleId),
      with: { package: true },
    });
    if (!schedule) throw notFound("Schedule not found");

    const allocations = await db.query.scheduleAllocations.findMany({
      where: eq(scheduleAllocations.scheduleId, scheduleId),
    });
    const studentIds = allocations.map((a) => a.studentId);

    const studentExamsRows = await db.query.studentExams.findMany({
      where: eq(studentExams.scheduleId, scheduleId),
    });

    const startedCount = studentExamsRows.filter(
      (se) => se.status !== "NOT_STARTED",
    ).length;
    const submittedCount = studentExamsRows.filter(
      (se) => se.status === "COMPLETED" || se.status === "WAITING_GRADING",
    ).length;
    const inProgressCount = studentExamsRows.filter(
      (se) => se.status === "IN_PROGRESS",
    ).length;

    // Anchor waktu kelas: attempt terlama yang mulai
    const startedAt = studentExamsRows
      .map((se) => se.startedAt)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    const timer = computeTimer({
      hasTimer: schedule.package.hasTimer,
      durationMinutes: schedule.package.durationMinutes,
      timeExtensionMinutes: schedule.timeExtensionMinutes,
      startedAt,
    });

    return {
      scheduleId,
      title: schedule.title,
      category: schedule.category,
      scheduleStatus: schedule.scheduleStatus,
      isActive: schedule.isActive,
      hasTimer: schedule.package.hasTimer,
      durationMinutes: schedule.package.durationMinutes,
      timeExtensionMinutes: schedule.timeExtensionMinutes,
      totalAllocated: studentIds.length,
      startedCount,
      submittedCount,
      inProgressCount,
      remainingSeconds: timer.remainingSeconds,
      elapsedSeconds: timer.elapsedSeconds,
      totalSeconds: timer.totalSeconds,
      deadlineAt: timer.deadlineAt,
      classroomClock: {
        anchorAt: startedAt?.getTime() ?? null,
        remainingSeconds: timer.remainingSeconds,
        elapsedSeconds: timer.elapsedSeconds,
        started: Boolean(startedAt),
      },
      motivation:
        motivationStore.get(scheduleId) ??
        DEFAULT_MOTIVATIONS[
          Math.floor(Date.now() / 1000) % DEFAULT_MOTIVATIONS.length
        ]!,
      updatedAt: new Date().toISOString(),
    };
  },

  // ===== Remote control guru =====

  // Visibilitas (read): guru hanya boleh lihat jadwal milik sendiri / buatan admin.
  async assertVisible(scheduleId: string, authUser?: AuthUser) {
    if (authUser?.role !== "TEACHER") return; // ADMIN bebas
    const schedule = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, scheduleId),
      columns: { createdByUserId: true },
    });
    if (!schedule) throw notFound("Schedule not found");
    const adminIds = await getAdminIds();
    if (!isVisibleToTeacher(schedule.createdByUserId, authUser.id, adminIds)) {
      throw notFound("Schedule not found");
    }
  },

  // Edit rights: guru hanya boleh atur jadwal milik sendiri.
  async assertEditable(scheduleId: string, authUser?: AuthUser) {
    if (authUser?.role !== "TEACHER") return; // ADMIN bebas
    const schedule = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, scheduleId),
      columns: { createdByUserId: true },
    });
    if (!schedule) throw notFound("Schedule not found");
    if (schedule.createdByUserId !== authUser.id) {
      throw forbidden("Anda hanya dapat mengatur jadwal buatan sendiri");
    }
  },

  async setStatus(
    scheduleId: string,
    status: (typeof examSchedules.$inferSelect)["scheduleStatus"],
    authUser?: AuthUser,
  ) {
    await this.assertEditable(scheduleId, authUser);
    const schedule = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, scheduleId),
    });
    if (!schedule) throw notFound("Schedule not found");

    await db
      .update(examSchedules)
      .set({ scheduleStatus: status })
      .where(eq(examSchedules.id, scheduleId));
    return this.getStatus(scheduleId, authUser);
  },

  /** Pause ujian: semua siswa berhenti, timer dihitung mundur berhenti. */
  pause(scheduleId: string, authUser?: AuthUser) {
    return this.setStatus(scheduleId, "PAUSED", authUser);
  },

  resume(scheduleId: string, authUser?: AuthUser) {
    return this.setStatus(scheduleId, "ON_GOING", authUser);
  },

  /** Tambah waktu (menit) utk semua peserta. */
  async addTime(scheduleId: string, minutes: number, authUser?: AuthUser) {
    await this.assertEditable(scheduleId, authUser);
    if (minutes <= 0) {
      // minimal 1 menit
      minutes = 1;
    }
    const schedule = await db.query.examSchedules.findFirst({
      where: eq(examSchedules.id, scheduleId),
    });
    if (!schedule) throw notFound("Schedule not found");

    const newExtension = schedule.timeExtensionMinutes + minutes;
    await db
      .update(examSchedules)
      .set({ timeExtensionMinutes: newExtension })
      .where(eq(examSchedules.id, scheduleId));
    return this.getStatus(scheduleId, authUser);
  },

  setMotivation(scheduleId: string, message: string, authUser?: AuthUser) {
    this.assertEditable(scheduleId, authUser);
    motivationStore.set(scheduleId, message);
  },

  clearMotivation(scheduleId: string, authUser?: AuthUser) {
    this.assertEditable(scheduleId, authUser);
    motivationStore.delete(scheduleId);
  },
};