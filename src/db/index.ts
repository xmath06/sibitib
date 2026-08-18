import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "@/config";
import { schema } from "./schema";

// postgres-js menggunakan TCP pooling native — ringan untuk Bun & Neon.
const client = postgres(config.db.url, {
  max: config.nodeEnv === "production" ? 20 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false, // Neon tidak mendukung prepared statements lintas koneksi pool
  onnotice: () => {}, // hentikan spam notice ke console
});

export const db = drizzle(client, {
  schema,
  casing: "snake_case",
});

export type DB = typeof db;

// Untuk query relasional dengan type-safety: db.query.<table>.findMany(...)
export { schema };