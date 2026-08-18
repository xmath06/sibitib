export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),

  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  db: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/cbt",
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? "dev-only-secret",
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? "15m",
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? "7d",
    cookieSecure: process.env.COOKIE_SECURE === "true",
    cookieSameSite: (process.env.COOKIE_SAME_SITE ?? "lax") as
      | "lax"
      | "strict"
      | "none",
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "auto",
    bucket: process.env.S3_BUCKET ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? "",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  },
} as const;

export type AppConfig = typeof config;
