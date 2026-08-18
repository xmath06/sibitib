import { Elysia, t, sse } from "elysia";
import { authenticate, requireRole } from "@/middleware/auth";
import { monitorService } from "./monitor.service";

export const monitorController = new Elysia({
  prefix: "/monitor",
  tags: ["Monitor"],
})
  .use(authenticate())
  .guard(requireRole("ADMIN", "TEACHER"))

  // Status tunggal (untuk polling)
  .get(
    "/:scheduleId/status",
    async ({ params }) => ({
      success: true,
      data: await monitorService.getStatus(params.scheduleId),
    }),
    {
      params: t.Object({ scheduleId: t.String() }),
      detail: { summary: "Current classroom status (polling)" },
    },
  )

  // SSE live stream untuk layar proyektor kelas.
  // Kirim status tiap 1 detik (bisa di-tuning).
  .get(
    "/:scheduleId/stream",
    ({ params }) =>
      sse(
        (async function* () {
          for (;;) {
            try {
              const status = await monitorService.getStatus(params.scheduleId);
              yield { data: status };
            } catch (e) {
              yield {
                data: {
                  error: "Schedule not found or monitor stopped",
                  message: e instanceof Error ? e.message : String(e),
                },
              };
              return;
            }
            await new Promise((r) => setTimeout(r, 1000));
          }
        })(),
      ),
    {
      params: t.Object({ scheduleId: t.String() }),
      detail: { summary: "SSE live stream for classroom big timer" },
    },
  )

  // Remote control: pause
  .post(
    "/:scheduleId/pause",
    async ({ params }) => ({
      success: true,
      data: await monitorService.pause(params.scheduleId),
    }),
    {
      params: t.Object({ scheduleId: t.String() }),
      detail: { summary: "Pause exam for all students" },
    },
  )

  // Remote control: resume
  .post(
    "/:scheduleId/resume",
    async ({ params }) => ({
      success: true,
      data: await monitorService.resume(params.scheduleId),
    }),
    {
      params: t.Object({ scheduleId: t.String() }),
      detail: { summary: "Resume exam" },
    },
  )

  // Remote control: tambah waktu
  .post(
    "/:scheduleId/add-time",
    async ({ params, body }) => ({
      success: true,
      data: await monitorService.addTime(params.scheduleId, body.minutes),
    }),
    {
      params: t.Object({ scheduleId: t.String() }),
      body: t.Object({ minutes: t.Number({ minimum: 1 }) }),
      detail: { summary: "Add time (minutes) to everyone" },
    },
  )

  // Motivasi di layar kelas
  .post(
    "/:scheduleId/motivation",
    async ({ params, body }) => {
      monitorService.setMotivation(params.scheduleId, body.message);
      return { success: true, data: { message: body.message } };
    },
    {
      params: t.Object({ scheduleId: t.String() }),
      body: t.Object({ message: t.String({ minLength: 1, maxLength: 300 }) }),
      detail: { summary: "Set motivation message on class screen" },
    },
  )
  .delete(
    "/:scheduleId/motivation",
    async ({ params }) => {
      monitorService.clearMotivation(params.scheduleId);
      return { success: true };
    },
    {
      params: t.Object({ scheduleId: t.String() }),
      detail: { summary: "Clear motivation message" },
    },
  );