import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/cbt",
  },
  casing: "snake_case",
  migrations: {
    table: "__drizzle_migrations__",
    schema: "public",
  },
});
