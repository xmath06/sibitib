import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { config } from "@/config";
import { sanitizeFileName } from "@/utils/misc";
import { badRequest } from "@/middleware/errors";

export type StoredFile = {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  name: string;
};

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/bmp",
  "image/x-icon",
  "image/avif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export function normalizeUploadedMimeType(file: Pick<File, "type" | "name">): string {
  const typed = file.type?.trim().toLowerCase();
  if (typed) return typed;

  const lowerName = file.name.toLowerCase();
  const ext = Object.keys(EXTENSION_TO_MIME).find((candidate) =>
    lowerName.endsWith(candidate),
  );
  const mimeType = ext ? EXTENSION_TO_MIME[ext] : undefined;
  return mimeType ?? "application/octet-stream";
}

export function isAllowedUploadType(file: Pick<File, "type" | "name">): boolean {
  const mimeType = normalizeUploadedMimeType(file);
  if (ALLOWED_TYPES.has(mimeType)) return true;

  if (mimeType.startsWith("image/")) return true;

  const lowerName = file.name.toLowerCase();
  return Object.keys(EXTENSION_TO_MIME).some((candidate) =>
    lowerName.endsWith(candidate),
  );
}

// S3Client kompatibel dengan Cloudflare R2 & AWS S3 (path-style utk R2).
const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint || undefined,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  forcePathStyle: config.s3.forcePathStyle,
});

function publicUrl(key: string): string {
  if (config.s3.publicBaseUrl) {
    return `${config.s3.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
  // Fallback: URL yang dikonstruksi dari endpoint + bucket
  return `${config.s3.endpoint}/${config.s3.bucket}/${key}`;
}

export const storageService = {
  /**
   * Upload file (dari multipart form-data) ke object storage.
   * @param file - object File dari Elysia
   * @param folder - contoh: "editor" | "avatars" | "attachments"
   */
  async upload(file: File, folder: string): Promise<StoredFile> {
    if (file.size > MAX_SIZE) {
      throw badRequest(
        `File too large. Maximum size is ${MAX_SIZE / (1024 * 1024)}MB`,
      );
    }

    const mimeType = normalizeUploadedMimeType(file);
    if (!isAllowedUploadType(file)) {
      throw badRequest(
        `File type "${file.type || mimeType}" is not allowed. Allowed: all image formats, PDF, DOCX`,
      );
    }

    const key = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}-${sanitizeFileName(file.name)}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    await s3.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
        // Cache agresif untuk aset statis yang immutable
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return {
      key,
      url: publicUrl(key),
      size: file.size,
      mimeType: file.type,
      name: file.name,
    };
  },

  async delete(key: string): Promise<void> {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
      }),
    );
  },

  /** Buat URL publik dari key yang sudah ada. */
  buildPublicUrl(key: string): string {
    return publicUrl(key);
  },
};