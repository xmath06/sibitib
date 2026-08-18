# AGENTS.md (Backend) — CBT & LMS

Panduan teknis pengembangan backend. Untuk orientasi proyek & kontrak API frontend, baca `../AGENTS.md`.

## Stack & Versi (ter-lock)

- Bun 1.3.x, ElysiaJS 1.4.29, @elysiajs/jwt 1.4.2, @elysiajs/cors 1.4.2, @elysiajs/swagger 1.3.1, @elysiajs/stream 1.1.0
- drizzle-orm 0.45.2, drizzle-kit 0.31.10, postgres-js 3.4.9 (`prepare: false`)
- bcryptjs 3.0.3 (10 rounds), @aws-sdk/client-s3 3.x
- TypeScript 5.9.x, tsconfig **tanpa `baseUrl`** (path alias `"@/*": ["./src/*"]`)

## Struktur Modul

```
src/modules/<domain>/
  <domain>.controller.ts   # route + t (Elysia schema) + pemanggilan service
  <domain>.service.ts      # logika bisnis + query drizzle (JANGAN taruh query di controller)
```

Controller daftarkan route dengan prefix **relatif**. Global wiring ada di `src/index.ts`
(CORS → `handleError` PERTAMA → swagger → mount semua controller dengan prefix `/api/v1`).

## Cara Menambah Endpoint Baru

1. Tambah method di controller domain (`.get/.post/...` dengan `params/body/query` bertipe `t.*`).
2. Panggil fungsi di `*.service.ts`. Service melempar `AppError` bila gagal.
3. Balas `{ success: true, data }`. Error ditangani global `handleError`.
4. Proteksi: `.use(authenticate())` lalu `.guard(requireRole("ADMIN","TEACHER"))`.
5. Jalankan `bun run typecheck`.

## Error Format

`AppError(code: string, status: number, message: string, details?)`. `handleError` mengubah
menjadi `{ success: false, error: { code, message, details? } }` dengan status HTTP.
Helper: `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `unprocessable`.

## Data Model (kolom kunci)

| Tabel | Kolom penting |
| ----- | ------------- |
| classes | id, grade_level (int), name |
| users | id, name, username (unique), password_hash, role `ADMIN\|TEACHER\|STUDENT`, class_id (fk→classes, set null), religion `ISLAM\|KRISTEN\|KATOLIK\|HINDU\|BUDDHA\|KONGHUCU\|OTHER\|null` |
| subjects | id, code (unique), name |
| topics | id, subject_id, name |
| questions | id, topic_id, question_text, question_type `MCQ\|ESSAY\|TRUE_FALSE\|POLY_CHOICE\|MULTI_SELECT`, min_word_count, max_word_count |
| options | id, question_id, option_text, score_weight (numeric) |
| exam_packages | id, subject_id, title, has_timer (default true), duration_minutes, pass_score (numeric), total_questions, is_random_questions, is_random_options |
| package_questions | package_id, question_id, order_number |
| exam_schedules | id, package_id, title, start_time, end_time, category, access_code, show_result_immediately, schedule_status `DRAFT\|ON_GOING\|PAUSED\|FINISHED`, is_active, target_type `ALL_STUDENTS\|BY_CLASS\|BY_GRADE\|SPECIFIC_STUDENTS`, target_religion (enum nullable), time_extension_minutes (int, default 0) |
| schedule_allocations | id, schedule_id, student_id |
| schedule_targets | schedule_id, target_class_id, target_grade_level, target_student_id |
| student_exams | id, allocation_id, student_id, schedule_id, attempt_number, started_at, submitted_at, total_score (numeric), status `NOT_STARTED\|IN_PROGRESS\|WAITING_GRADING\|COMPLETED` |
| student_answers | id, student_exam_id, question_id, selected_option_id, essay_answer, word_count, score (numeric), teacher_feedback, is_flagged, updated_at; unique(student_exam_id, question_id, selected_option_id) → MULTI_SELECT boleh banyak baris |

## Timer (server-synced)

`computeTimer({hasTimer, durationMinutes, timeExtensionMinutes, startedAt})` di `utils/timer.ts`.
`deadlineAt = startedAt + (durationMinutes + timeExtensionMinutes) * 60_000` (epoch ms).
Client HARUS menghitung sisa dari `deadlineAt - Date.now()`, bukan dari `remainingSeconds`.

## Gotchas (sudah terbukti)

- `onError` global harus sebelum routes. `.derive` perlu `{ as: "global" }` agar tipe menyebar.
- Drizzle relational + correlated `exists` gagal → two-step query. `where` callback di `with` deprecated.
- `prefix: "/"` di controller memecah komposisi route. Param beda nama di posisi sama dilarang memoirist.
- `@elysiajs/cookie` tidak kompatibel Elysia 1.4 → pakai cookie reaktif bawaan.
- **Swagger UI (Scalar) di-vendor lokal.** `@elysiajs/swagger` memuat Scalar dari CDN jsdelivr — gagal di environment offline. Bundle ada di `public/scalar/standalone.min.js`, di-serve via route eksplisit `/api/v1/scalar/standalone.min.js` (`Bun.file`), dan `scalarCDN` di `src/index.ts` menunjuk ke path lokal. JANGAN kembalikan ke CDN. Elysia static serving `public/` bermasalah di setup ini, jadi aset lokal di-handle manual.

## Migrasi

Ubah schema di `src/db/schema/*.ts` → `bun run db:generate` → `bun run db:migrate`.
Update `seed.ts` bila perlu data baru. `bunx drizzle-kit check` untuk verifikasi.