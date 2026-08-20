import { NotFoundError } from "elysia";
import { AppError } from "./errors";

type ErrorContext = {
  error: unknown;
  // set di Elysia menerima number | string status code (mis. 401, "Unauthorized")
  set: { status?: number | string };
  // code bisa berupa string (mis. VALIDATION) atau status number
  code: string | number;
};

// Label Indonesia per field untuk pesan error validasi yang manusiawi.
const FIELD_LABELS: Record<string, string> = {
  packageId: "Paket soal",
  title: "Judul",
  category: "Kategori",
  startTime: "Waktu mulai",
  endTime: "Waktu selesai",
  accessCode: "Kode akses",
  showResultImmediately: "Tampilkan hasil",
  targetType: "Sasaran peserta",
  targetReligion: "Agama",
  targetClassIds: "Kelas",
  targetGradeLevels: "Jenjang",
  studentIds: "Siswa",
  questionText: "Teks soal",
  questionType: "Tipe soal",
  options: "Opsi jawaban",
  topicId: "Topik",
  subjectId: "Mata pelajaran",
  username: "Username",
  password: "Password",
  name: "Nama",
  role: "Peran",
  religion: "Agama",
  classId: "Kelas",
};

// Nilai yang diizinkan untuk enumerasi (dari schema anyOf/enum TypeBox),
// mis. ["EXAM","ASSIGNMENT","QUIZ","PRACTICE"].
function allowedValues(err: any): string[] {
  const schema = err?.schema ?? err?.expected;
  if (Array.isArray(schema?.anyOf)) {
    const vals = schema.anyOf
      .map((s: any) => s?.const)
      .filter((v: unknown): v is string => typeof v === "string");
    if (vals.length) return vals;
  }
  if (Array.isArray(schema?.enum)) return schema.enum.map(String);
  return [];
}

// Error validasi Elysia berisi objek { property, summary, errors: [...] }.
// Ubah jadi satu kalimat bahasa Indonesia yang bisa dibaca manusia.
function humanizeValidation(error: unknown): string {
  const e = error as any;
  // Field/property kadang tidak bisa diakses langsung (getter Elysia);
  // data lengkap ada di e.message sebagai string JSON.
  let parsed: any = null;
  if (typeof e?.message === "string") {
    try {
      parsed = JSON.parse(e.message);
    } catch {
      parsed = null;
    }
  }
  const obj = parsed ?? e;
  const prop = typeof obj?.property === "string" ? obj.property.replace(/^\//, "") : "";
  const field = FIELD_LABELS[prop] ?? (prop || "data");
  const first = Array.isArray(obj?.errors) ? obj.errors[0] : null;
  const allowed = allowedValues(first ?? obj);

  if (prop === "category" && allowed.length) {
    return `Kategori "${obj?.found?.category}" tidak valid. Pilih salah satu: ${allowed.join(", ")}`;
  }
  if (allowed.length) {
    return `Nilai ${field} tidak valid. Pilih salah satu: ${allowed.join(", ")}`;
  }
  if (obj?.summary && typeof obj.summary === "string") {
    return `${field} tidak valid: ${obj.summary}`;
  }
  const raw = typeof obj?.message === "string" ? obj.message : "";
  return raw ? `${field} tidak valid: ${raw}` : "Data yang dikirim tidak valid";
}

// Global error handler yang didaftarkan di root app.
export const handleError = ({ error, set, code }: ErrorContext) => {
  if (error instanceof AppError) {
    set.status = error.statusCode;
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    };
  }

  // Error validasi Elysia (dari t.Object schema)
  if (code === "VALIDATION") {
    set.status = 422;
    return {
      success: false,
      error: {
        code: "VALIDATION",
        message: humanizeValidation(error),
      },
    };
  }

  // Route tidak ditemukan → balas 404 (bukan 500). Health check platform
  // (SnapDeploy) memukul path yang tidak terdaftar (mis. "/") dan bila ini
  // berubah jadi 500 container dianggap tidak sehat → restart loop.
  if (code === "NOT_FOUND" || error instanceof NotFoundError) {
    set.status = 404;
    return {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Route tidak ditemukan",
      },
    };
  }

  console.error(
    `[ERROR] ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );

  set.status = 500;
  return {
    success: false,
    error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" },
  };
};