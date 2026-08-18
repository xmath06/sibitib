/**
 * Perhitungan waktu ujian ter-sinkronisasi server-side.
 * Semua waktu dihitung dari `started_at` + `duration_minutes` + `time_extension_minutes`,
 * bukan dari sisi client (anti cheat / waktu lokal siswa).
 */

export interface TimerParams {
  hasTimer: boolean;
  durationMinutes: number | null;
  timeExtensionMinutes: number;
  startedAt: Date | null;
  now?: Date;
}

export interface TimerResult {
  hasTimer: boolean;
  remainingSeconds: number | null;
  elapsedSeconds: number | null;
  totalSeconds: number | null;
  expired: boolean;
  startedAt: Date | null;
  // Waktu mutlak (epoch ms) kapan ujian berakhir. null jika tanpa timer.
  deadlineAt: number | null;
}

export function computeTimer({
  hasTimer,
  durationMinutes,
  timeExtensionMinutes = 0,
  startedAt,
  now = new Date(),
}: TimerParams): TimerResult {
  if (!hasTimer || durationMinutes == null || startedAt == null) {
    return {
      hasTimer: false,
      remainingSeconds: null,
      elapsedSeconds: null,
      totalSeconds: null,
      expired: false,
      startedAt,
      deadlineAt: null,
    };
  }

  const totalSeconds = (durationMinutes + (timeExtensionMinutes || 0)) * 60;
  const deadlineAt = startedAt.getTime() + totalSeconds * 1000;
  const nowMs = now.getTime();
  const remainingSeconds = Math.max(0, Math.floor((deadlineAt - nowMs) / 1000));
  const elapsedSeconds = Math.max(
    0,
    Math.floor((nowMs - startedAt.getTime()) / 1000),
  );

  return {
    hasTimer: true,
    remainingSeconds,
    elapsedSeconds,
    totalSeconds,
    expired: remainingSeconds <= 0,
    startedAt,
    deadlineAt,
  };
}

// Menghitung jumlah kata dari jawaban esai (abaikan tag HTML untuk Tiptap).
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const stripped = text.replace(/<[^>]*>/g, " ");
  const words = stripped.match(/\b[\w'-]+\b/g);
  return words?.length ?? 0;
}