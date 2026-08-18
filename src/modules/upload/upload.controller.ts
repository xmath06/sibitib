import { Elysia, t } from "elysia";
import { authenticate, requireRole } from "@/middleware/auth";
import { storageService } from "@/storage/s3";
import { badRequest } from "@/middleware/errors";

export const uploadController = new Elysia({
  prefix: "/upload",
  tags: ["Upload"],
})
  .use(authenticate())
  // Semua role boleh upload (guru/siswa ke editor). Folder ditentukan server-side.
  .guard(requireRole("ADMIN", "TEACHER", "STUDENT"))

  .post(
    "/",
    async ({ body }) => {
      if (!body.file) throw badRequest("No file uploaded");
      const stored = await storageService.upload(body.file, "editor");
      return {
        success: true,
        data: stored,
      };
    },
    {
      body: t.Object({
        file: t.File({
          maxSize: 10 * 1024 * 1024, // 10MB
          type: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/svg+xml",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ],
        }),
      }),
      detail: { summary: "Upload image/file for rich text editor" },
    },
  );