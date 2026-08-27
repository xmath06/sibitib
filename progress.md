# progress.md — CBT Backend

> Dibuat 2026-08-27. Catatan continuity lintas sesi.

## Repo & Status
- Repo: `git@github.com:xmath06/sibitib.git`.
- Stack: Bun + ElysiaJS 1.4 + Drizzle ORM + PostgreSQL (Neon) + S3-compatible.
- Status: **SELESAI** (lolos integration test manual). 14 tabel
  (`classes, users, subjects, topics, questions, options, exam_packages,
  package_questions, exam_schedules, schedule_allocations, schedule_targets,
  student_exams, student_answers, teacher_subjects`).

## Branch Strategy (PENTING)
- `main` = **v1 (scoring)** — FROZEN, hanya bugfix kritis. JANGAN merge fitur baru.
- `v2` = branch fitur (isolasi guru, kepemilikan paket/jadwal, perubahan Bank Soal).
  Semua pekerjaan baru di `v2`.
- ⚠️ **Launcher meng-clone `main` (v1)** saat build. Jika produk ter-distribusi
  harus berisi v2, CI launcher harus diubah clone branch `v2`.

## Konvensi (singkat — lihat AGENTS.md untuk lengkap)
- Controller = `*.controller.ts` (route+schema), `*.service.ts` (logika).
- Prefix controller RELATIF (`/auth`), jangan `/api/v1/...`.
- Error: `AppError` + `handleError` terdaftar PERTAMA di `src/index.ts`.
- Auth: `.use(authenticate())` lalu `.guard(requireRole(...))`.
- `questionText` = HTML mentah (rumus/tabel/gambar).
- `PUT /packages/:id` `questionIds` = replace seluruh daftar.

## Autograding (uraian)
Terjadi di `POST /exams/:studentExamId/submit` → service nilai tiap
`student_answers`, aggregasi ke `student_exams.score`.

| Tipe | Skor otomatis |
|---|---|
| MCQ / TRUE_FALSE | `selectedOptionId` == opsi `is_correct` → `score_weight` penuh, else 0 |
| POLY_CHOICE / MULTI_SELECT | banding himpunan `selectedOptionIds` dgn opsi benar → all-or-nothing / parsial |
| URAIAN_PENDEK | exact match (lowercase+trim+buang tanda baca) dgn kunci → benar/salah |
| ESSAY (murni) | **DIKECUALIKAN** (permintaan pengguna) → tetap `WAITING_GRADING` |

Tipe objektif SUDAH auto-grading. `min_word_count`/`max_word_count` hanya warning.
Lokasi: `src/services/exams.service.ts` + `exams.controller.ts`.

## Open Items / Gap
1. **S3/R2 belum terkonfigurasi** → upload gambar editor Bank Soal tidak jalan
   (`.env` S3_* kosong). Dampak ke produk ter-distribusi.
2. **Auto-grading esai murni belum ada** — by design (subjektif), dinilai guru manual.
3. **Test otomatis kosong** (`backend/tests/`) — verifikasi selama ini manual
   (curl). Bukan error, tapi tidak ada jaring pengaman regresi.
4. **`motivation` monitor in-memory** — hilang saat restart (keputusan: biarkan).
5. **Grafik kartesius** — masih wacana.

## Deploy
- Backend → Render (disk ephemeral → butuh object storage untuk upload).

## Catatan Launcher
- Launcher menjalankan `bun run db:migrate` + `bun run db:seed` saat
  "Install Database". `ensure_backend_env` isi `DATABASE_URL` + `JWT_SECRET`.
  Butuh `CORS_ORIGIN` (localhost ok) & `S3_*` (lihat #1).
