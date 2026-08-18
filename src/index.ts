// Paksa zona waktu aplikasi mengikuti WIB (Asia/Jakarta) agar waktu server,
// log, dan formatting lokal konsisten dengan regional Indonesia.
process.env.TZ = "Asia/Jakarta";

import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { config } from "@/config";
import { handleError } from "@/middleware";
import { authController } from "@/modules/auth";
import { usersController, teacherStudentsController } from "@/modules/users";
import { subjectsController, topicsController } from "@/modules/subjects";
import { questionsController } from "@/modules/subjects";
import { packagesController } from "@/modules/packages";
import { schedulesController, studentSchedulesController, studentSchedulesLegacyController } from "@/modules/schedules";
import { examsController } from "@/modules/exams";
import { gradingController } from "@/modules/grading";
import { uploadController } from "@/modules/upload";
import { monitorController } from "@/modules/monitor";
import { classesController } from "@/modules/classes";

export const app = new Elysia({ prefix: "/api/v1" })
  // ===== Global error handler (harus terdaftar sebelum routes) =====
  .onError(handleError)
  // ===== CORS: support credentials (cookie) dari domain frontend =====
  .use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      exposeHeaders: ["Content-Disposition"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 86400,
    }),
  )
   .use(
     swagger({
       path: "/docs",
       // Vendor Scalar UI secara lokal (public/scalar/standalone.min.js)
       // agar Swagger tetap jalan tanpa akses CDN (offline/terisolasi).
       scalarCDN: "/api/v1/scalar/standalone.min.js",
       documentation: {
        info: {
          title: "CBT & LMS API",
          version: "1.0.0",
          description:
            "Backend API untuk Computer Based Test & LMS. Auth via HTTP-only cookie (JWT).",
        },
        tags: [
          { name: "Auth", description: "Login / Refresh / Logout" },
          { name: "Users", description: "Manajemen pengguna (admin)" },
          { name: "Question Bank", description: "Subjects, topics, questions" },
          { name: "Packages", description: "Paket ujian" },
          { name: "Schedules", description: "Penjadwalan & alokasi" },
          { name: "Student Schedules", description: "Jadwal milik siswa" },
          { name: "Exam Execution", description: "Kerjakan ujian" },
          { name: "Grading", description: "Penilaian esai & rekap" },
          { name: "Monitor", description: "Live classroom monitoring" },
          { name: "Upload", description: "Upload media ke object storage" },
        ],
      },
    }),
  )
  .get(
    "/health",
    () => ({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
    { detail: { summary: "Health check" } },
  )

  // Serve Scalar UI bundle secara lokal (offline-friendly).
  // Elysia static serving bermasalah di setup ini, jadi di-handle manual.
  .get("/scalar/standalone.min.js", () => Bun.file("public/scalar/standalone.min.js"), {
    detail: { hide: true },
  })

  // ===== Controllers (modular) =====
  .use(authController)
  .use(usersController)
  .use(teacherStudentsController)
  .use(subjectsController)
  .use(topicsController)
  .use(questionsController)
  .use(packagesController)
  .use(schedulesController)
  .use(studentSchedulesController)
  .use(studentSchedulesLegacyController)
  .use(examsController)
  .use(gradingController)
  .use(uploadController)
  .use(monitorController)
  .use(classesController);

if (process.env.NODE_ENV !== "test") {
  const port = config.port;
  app.listen(port, () => {
    console.log(`🦊 CBT & LMS API running at http://localhost:${port}`);
    console.log(`   Swagger docs:  http://localhost:${port}/api/v1/docs`);
    console.log(`   Health check:  http://localhost:${port}/api/v1/health`);
  });
}

export type App = typeof app;