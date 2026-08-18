import { Elysia, t } from "elysia";
import { authenticate, requireRole } from "@/middleware/auth";
import { forbidden } from "@/middleware/errors";
import { scheduleService, studentScheduleQueries } from "./schedules.service";

const scheduleStatusSchema = t.Union([
  t.Literal("SCHEDULED"),
  t.Literal("ON_GOING"),
  t.Literal("PAUSED"),
  t.Literal("ENDED"),
]);

const targetTypeSchema = t.Union([
  t.Literal("ALL_STUDENTS"),
  t.Literal("BY_CLASS"),
  t.Literal("BY_GRADE"),
  t.Literal("SPECIFIC_STUDENTS"),
]);

const religionSchema = t.Union([
  t.Literal("ISLAM"),
  t.Literal("KRISTEN"),
  t.Literal("KATOLIK"),
  t.Literal("HINDU"),
  t.Literal("BUDDHA"),
  t.Literal("KONGHUCU"),
  t.Literal("OTHER"),
]);

export const schedulesController = new Elysia({
  prefix: "/schedules",
  tags: ["Schedules"],
})
  .use(authenticate())
  .guard(requireRole("ADMIN", "TEACHER"))

  .get(
    "/",
    async ({ query }) =>
      scheduleService.list({
        search: query.search,
        status: query.status,
        page: query.page,
        limit: query.limit,
      }),
    {
      query: t.Object({
        search: t.Optional(t.String()),
        status: t.Optional(scheduleStatusSchema),
        page: t.Optional(t.Number()),
        limit: t.Optional(t.Number()),
      }),
      detail: { summary: "List schedules (teacher/admin)" },
    },
  )
  .get(
    "/:id",
    async ({ params }) => scheduleService.getById(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Get schedule detail" },
    },
  )
  .post(
    "/",
    async ({ body }) =>
      scheduleService.create({
        ...body,
        startTime: new Date(body.startTime),
        endTime: body.endTime ? new Date(body.endTime) : null,
      }),
    {
      body: t.Object({
        packageId: t.String(),
        title: t.String({ minLength: 1 }),
        category: t.Optional(
          t.Union([
            t.Literal("EXAM"),
            t.Literal("ASSIGNMENT"),
            t.Literal("QUIZ"),
            t.Literal("PRACTICE"),
          ]),
        ),
        accessCode: t.Optional(t.Nullable(t.String())),
        startTime: t.String(), // ISO date string
        endTime: t.Optional(t.Nullable(t.String())),
        showResultImmediately: t.Optional(t.Boolean()),
        studentIds: t.Optional(t.Array(t.String())),
        targetType: t.Optional(targetTypeSchema),
        targetReligion: t.Optional(t.Nullable(religionSchema)),
        targetClassIds: t.Optional(t.Array(t.String())),
        targetGradeLevels: t.Optional(t.Array(t.Number())),
      }),
      detail: { summary: "Create schedule with targeting & allocations" },
    },
  )
  .put(
    "/:id",
    async ({ params, body, authUser }) => {
      // Guru hanya boleh mengedit jadwal yang BELUM dimulai.
      // Admin bebas mengedit kapan saja (termasuk yang waktunya sudah terlewat).
      if (authUser.role === "TEACHER") {
        const existing = await scheduleService.getById(params.id);
        const started =
          existing.startTime <= new Date() || existing.scheduleStatus !== "SCHEDULED";
        if (started) {
          throw forbidden("Guru hanya dapat mengedit jadwal yang belum dimulai");
        }
      }
      return scheduleService.update(params.id, {
        ...body,
        startTime: body.startTime ? new Date(body.startTime) : undefined,
        endTime: body.endTime !== undefined ? (body.endTime ? new Date(body.endTime) : null) : undefined,
      });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1 })),
        category: t.Optional(
          t.Union([
            t.Literal("EXAM"),
            t.Literal("ASSIGNMENT"),
            t.Literal("QUIZ"),
            t.Literal("PRACTICE"),
          ]),
        ),
        accessCode: t.Optional(t.Nullable(t.String())),
        startTime: t.Optional(t.String()),
        endTime: t.Optional(t.Nullable(t.String())),
        showResultImmediately: t.Optional(t.Boolean()),
        isActive: t.Optional(t.Boolean()),
        studentIds: t.Optional(t.Array(t.String())),
        targetType: t.Optional(targetTypeSchema),
        targetReligion: t.Optional(t.Nullable(religionSchema)),
        targetClassIds: t.Optional(t.Array(t.String())),
        targetGradeLevels: t.Optional(t.Array(t.Number())),
      }),
      detail: { summary: "Update schedule" },
    },
  )
  .delete(
    "/:id",
    async ({ params }) => scheduleService.remove(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Delete schedule" },
    },
  )
  .post(
    "/:id/allocate",
    async ({ params, body }) =>
      scheduleService.allocateStudents(params.id, body.studentIds),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ studentIds: t.Array(t.String()) }),
      detail: { summary: "Replace student allocations for a schedule" },
    },
  );

// ===== Endpoint siswa: jadwal aktif utk dirinya =====
export const studentSchedulesController = new Elysia({
  prefix: "/student/schedules",
  tags: ["Student Schedules"],
})
  .use(authenticate())
  .guard(requireRole("STUDENT"))

  .get(
    "/active",
    async ({ authUser }) =>
      studentScheduleQueries.getActiveSchedulesForStudent(authUser.id),
    { detail: { summary: "List active schedules for the logged-in student (precise filtering)" } },
  )
  .get(
    "/history",
    async ({ authUser }) => studentScheduleQueries.getHistoryForStudent(authUser.id),
    { detail: { summary: "Riwayat ujian/tugas siswa (semua status)" } },
  )
  .get(
    "/:id",
    async ({ authUser, params }) =>
      studentScheduleQueries.getStudentSchedule(params.id, authUser.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Get one of my schedules" },
    },
  );

// ===== Backward-compat: /my/schedules =====
export const studentSchedulesLegacyController = new Elysia({
  prefix: "/my",
  tags: ["Student Schedules"],
})
  .use(authenticate())
  .guard(requireRole("STUDENT"))

  .get(
    "/schedules",
    async ({ authUser }) =>
      studentScheduleQueries.getActiveSchedulesForStudent(authUser.id),
    { detail: { summary: "List my active schedules" } },
  )
  .get(
    "/schedules/:id",
    async ({ authUser, params }) =>
      studentScheduleQueries.getStudentSchedule(params.id, authUser.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Get one of my schedules" },
    },
  );