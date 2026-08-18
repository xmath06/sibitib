# CBT & LMS Backend API

Backend untuk aplikasi **Computer Based Test (CBT)** & **LMS** — performant, modular, dan siap produksi.

| Layer        | Teknologi                                      |
| ------------ | ---------------------------------------------- |
| Runtime      | [Bun](https://bun.sh) 1.3+                     |
| Framework    | [ElysiaJS](https://elysiajs.com) 1.x           |
| Database     | PostgreSQL (Neon Serverless Postgres)          |
| ORM          | [Drizzle ORM](https://orm.drizzle.team)        |
| Object Store | Cloudflare R2 / AWS S3 (S3-compatible)         |
| Auth         | JWT via HTTP-only Cookie (anti-XSS)            |

---

## Struktur Folder

```
backend/
├── drizzle.config.ts          # Konfigurasi drizzle-kit
├── package.json
├── .env.example               # Template environment variable
└── src/
    ├── index.ts               # Root app: CORS, Swagger, wiring controller
    ├── config/
    │   └── index.ts           # Typed config dari env
    ├── db/
    │   ├── index.ts           # Koneksi postgres-js + drizzle
    │   ├── schema/            # Definisi tabel + relations (13 tabel)
    │   ├── migrations/        # Hasil generate drizzle-kit
    │   └── seed.ts            # Data development
    ├── middleware/
    │   ├── auth.ts            # authenticate() + requireRole() RBAC
    │   ├── errors.ts          # AppError helper
    │   └── index.ts           # Global error handler
    ├── modules/               # Modular: Controller + Service per domain
    │   ├── auth/              # login, refresh, logout, me
    │   ├── users/             # CRUD user (admin)
    │   ├── subjects/          # subjects, topics, questions, options
    │   ├── packages/          # exam_packages
    │   ├── schedules/         # exam_schedules + allocations
    │   ├── exams/             # mulai ujian, auto-save, submit
    │   ├── grading/           # penilaian esai & rekap nilai
    │   ├── upload/            # media upload ke S3/R2
    │   └── monitor/           # SSE live classroom + remote control
    ├── storage/
    │   └── s3.ts              # S3Client (R2/AWS)
    └── utils/
        ├── timer.ts           # Server-synced timer
        ├── password.ts        # bcrypt
        └── misc.ts            # shuffle, sanitize, access code
```

---

## Setup

```bash
cd backend
cp .env.example .env          # isi DATABASE_URL, JWT_SECRET, S3_*, CORS_ORIGIN
bun install
bun run db:generate           # (sudah ada) buat ulang migration SQL
bun run db:migrate            # jalankan migration ke Neon
bun run db:seed               # data contoh (opsional)
bun run dev                   # http://localhost:3000
```

- Swagger/OpenAPI: `http://localhost:3000/api/v1/docs`
- Health check: `http://localhost:3000/api/v1/health`

> Semua endpoint berada di prefix `/api/v1`.

---

## Environment Variables

| Variable               | Keterangan                                             |
| ---------------------- | ------------------------------------------------------ |
| `PORT`                 | Port server (default `3000`)                           |
| `NODE_ENV`             | `development` / `production`                           |
| `CORS_ORIGIN`          | Origin frontend, pisahkan koma. Contoh `http://localhost:5173` |
| `DATABASE_URL`         | URL PostgreSQL (Neon `postgresql://...?sslmode=require`) |
| `JWT_SECRET`           | Secret panjang & acak untuk access + refresh token     |
| `JWT_ACCESS_EXPIRES`   | Contoh `15m`                                            |
| `JWT_REFRESH_EXPIRES`  | Contoh `7d`                                             |
| `COOKIE_SECURE`        | `true` saat HTTPS (production), `false` untuk local HTTP |
| `COOKIE_SAME_SITE`     | `Lax` / `Strict` / `None`                              |
| `S3_ENDPOINT`          | `https://<account>.r2.cloudflarestorage.com` (R2) atau kosong utk AWS S3 |
| `S3_REGION`            | `auto` untuk R2, `ap-southeast-1` dll utk AWS           |
| `S3_BUCKET`            | Nama bucket                                            |
| `S3_ACCESS_KEY_ID`     | Access key                                             |
| `S3_SECRET_ACCESS_KEY` | Secret key                                             |
| `S3_PUBLIC_BASE_URL`   | URL publik, contoh `https://cdn.example.com`           |
| `S3_FORCE_PATH_STYLE`  | `true` untuk R2/MinIO, `false` utk AWS S3              |

---

## Keamanan Auth (HTTP-Only Cookie)

- **Login** `POST /api/v1/auth/login` → menyetel dua cookie:
  - `access_token`: `HttpOnly; Secure; SameSite=Lax; Path=/`
  - `refresh_token`: `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth/refresh`
- **Refresh** `POST /api/v1/auth/refresh` → rotasi token baru (cookie refresh hanya terkirim ke path ini).
- **Logout** `POST /api/v1/auth/logout` → hapus kedua cookie.
- CORS mengaktifkan `credentials: true` agar cookie ikut terkirim dari frontend.

> **Penting:** frontend **tidak pernah** menyentuh token via JS (no localStorage). Semua otomatis lewat cookie.

---

## RBAC Roles

| Role     | Akses                                                                 |
| -------- | --------------------------------------------------------------------- |
| `ADMIN`  | Semua, termasuk CRUD user                                             |
| `TEACHER`| Kelola bank soal, paket, jadwal, grading, monitoring                  |
| `STUDENT`| Kerjakan ujian, auto-save, lihat hasil                               |

Guard: `.use(authenticate())` untuk proteksi, `.guard(requireRole("ADMIN", "TEACHER"))` untuk role.

---

## API Endpoints (ringkasan)

### Auth
| Method | Path                          | Keterangan                     |
| ------ | ----------------------------- | ------------------------------ |
| POST   | `/auth/login`                 | Login, set cookie              |
| POST   | `/auth/refresh`               | Refresh access token           |
| POST   | `/auth/logout`                | Logout, hapus cookie           |
| GET    | `/auth/me`                    | Profil user saat ini           |
| POST   | `/auth/change-password`       | Ganti password sendiri         |

### Users (admin)
`GET/POST/PUT/DELETE /users[/:id]`

### Bank Soal
| Method | Path                          | Keterangan                     |
| ------ | ----------------------------- | ------------------------------ |
| GET    | `/subjects`                   | List mata pelajaran            |
| POST   | `/subjects`                   | Buat subject (admin/guru)      |
| POST   | `/topics`                     | Buat topic                     |
| GET    | `/questions?topicId=...`      | List soal per topic            |
| POST   | `/questions`                  | Buat soal + opsi (score_weight)|
| PUT    | `/questions/:id`              | Update soal/opsi               |
| DELETE | `/questions/:id`              | Hapus soal                     |

### Paket & Jadwal
`GET/POST/PUT/DELETE /packages[/:id]`
- `GET /packages` mengembalikan `questionCount` per paket (jumlah soal ter-link).
- `PUT /packages/:id` menerima `questionIds` → **replace seluruh** daftar soal (dipakai fitur "Kelola Soal" frontend, multi-topik).
- Soal dalam paket adalah snapshot eksplisit (`package_questions`) — menambah soal di bank **tidak** otomatis masuk ke paket yang sudah ada.

`GET/POST/PUT/DELETE /schedules[/:id]` — dukung *targeting* (lihat bawah)
`POST /schedules/:id/allocate` — ganti alokasi siswa (specific)
`GET /student/schedules/active` — jadwal aktif utk siswa, **filter presisi** (STUDENT)
`GET /my/schedules` — alias legacy dari `/student/schedules/active`

### Targeting Jadwal (siapa yang melihat jadwal ini)
Setiap jadwal punya `targetType` + `targetReligion` + baris `schedule_targets`:

| `targetType`          | Kriteria siswa yang melihat                            |
| --------------------- | ------------------------------------------------------ |
| `ALL_STUDENTS`        | Semua siswa (default)                                  |
| `BY_CLASS`            | `schedule_targets.target_class_id = siswa.class_id`    |
| `BY_GRADE`            | `schedule_targets.target_grade_level = kelas.grade_level` |
| `SPECIFIC_STUDENTS`   | `schedule_targets.target_student_id = siswa.id`        |

**Filter presisi** (`GET /student/schedules/active`) untuk siswa login:
1. `is_active = true` DAN dalam rentang waktu valid.
2. Agama: `target_religion IS NULL` ATAU `target_religion = siswa.religion`.
3. Target group sesuai tabel di atas (kriteria digabung OR).

Saat create/update jadwal, kirim `targetClassIds`, `targetGradeLevels`, dan/atau
`studentIds` → otomatis ditulis ke `schedule_targets`. Saat siswa mulai ujian
(`/exams/start/:scheduleId`), jika belum ada alokasi eksplisit, sistem
meng-*auto-allocation* bila siswa memenuhi kriteria targeting.
Kolom `religion` & `class_id` siswa diatur saat create/update user (admin).

### Exam Execution (STUDENT)
| Method | Path                                  | Keterangan                            |
| ------ | ------------------------------------- | ------------------------------------- |
| POST   | `/exams/start/:scheduleId`            | Mulai ujian (dgn access code bila ada) |
| GET    | `/exams/:studentExamId`               | Soal + opsi (acak jika diatur)        |
| GET    | `/exams/:studentExamId/time`          | **Server-synced remaining time**      |
| POST   | `/exams/:studentExamId/answers`       | **Debounced auto-save** (cepat)       |
| POST   | `/exams/:studentExamId/submit`        | Submit + **auto-grading** pilihan     |
| GET    | `/exams/:studentExamId/result`        | Hasil ujian                           |

### Grading (TEACHER/ADMIN)
| Method | Path                                  | Keterangan                            |
| ------ | ------------------------------------- | ------------------------------------- |
| GET    | `/grading/:studentExamId`             | Lihat jawaban siswa                   |
| POST   | `/grading/:studentExamId/essays`      | Input nilai + feedback esai (batch)   |
| PUT    | `/grading/answers/:answerId`          | Nilai satu jawaban                    |
| GET    | `/grading/recap/schedule/:scheduleId` | Rekap nilai per jadwal                |

### Monitor (Classroom Big Timer & Remote Control)
| Method | Path                             | Keterangan                          |
| ------ | -------------------------------- | ----------------------------------- |
| GET    | `/monitor/:scheduleId/status`    | Status polling (JSON)               |
| GET    | `/monitor/:scheduleId/stream`    | **SSE live stream** utk layar kelas |
| POST   | `/monitor/:scheduleId/pause`     | Pause ujian (`schedule_status=PAUSED`) |
| POST   | `/monitor/:scheduleId/resume`    | Resume ujian                        |
| POST   | `/monitor/:scheduleId/add-time`  | Tambah waktu (menit)                |
| POST   | `/monitor/:scheduleId/motivation`| Set pesan motivasi di layar         |

### Upload
`POST /upload` — multipart `file` field → S3/R2, balas `{ url }` utk Rich Text Editor.

---

## Exam Timer (Synchronized Server Time)

- Waktu dihitung **100% server-side**: `started_at + duration_minutes + time_extension_minutes`.
- Client memanggil `GET /exams/:id/time` untuk sinkronisasi timer (anti cheat).
- `has_timer=false` → mode penugasan bebas (tanpa batas waktu).
- Teacher bisa `pause` dan `add-time` via endpoint monitor; server meneruskan
  `time_extension_minutes` ke perhitungan semua siswa.

## Auto-grading

- `MCQ`, `TRUE_FALSE`, `POLY_CHOICE`: skor = `score_weight` opsi yang dipilih (0 jika kosong).
- `MULTI_SELECT`: skor = jumlah `score_weight` semua opsi terpilih.
- `ESSAY`: masuk ke `WAITING_GRADING`, dinilai guru via `/grading`.
- `min_word_count` / `max_word_count` divalidasi di **frontend** (warning saja); submit tetap sukses (200) walau di bawah minimum — nilai tetap diproses oleh guru.

---

## Deployment (Render / SnapDeploy)

1. Set semua environment variable di dashboard (lihat `.env.example`).
2. Build command: `bun install`
3. Start command: `bun run start` (atau `bun src/index.ts`)
4. Migrasi: jalankan `bun run db:migrate` sekali (mis. via script render-postdeploy).

> Untuk **Cloudflare R2**: pastikan `S3_ENDPOINT` dan `S3_PUBLIC_BASE_URL`
> (mis. custom domain `https://cdn.domain.com`) terisi; set `S3_FORCE_PATH_STYLE=true`.
> Untuk **AWS S3**: biarkan `S3_ENDPOINT` kosong dan `S3_FORCE_PATH_STYLE=false`.

---

## Scripts

```bash
bun run dev          # dev dengan watch
bun run start        # production
bun run db:generate  # generate migration SQL
bun run db:migrate   # apply migration
bun run db:push      # push schema langsung (tanpa file migration)
bun run db:seed      # seed development
bun run typecheck    # tsc --noEmit
```