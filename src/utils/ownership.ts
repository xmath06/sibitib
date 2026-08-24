import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { AuthUser } from "@/middleware/auth";

// ID semua user ADMIN — dipakai untuk menentukan paket/jadwal "global"
// (buatan admin) yang boleh dilihat semua guru namun read-only.
export async function getAdminIds(): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "ADMIN"));
  return rows.map((r) => r.id);
}

// Aturan visibilitas jadwal/paket untuk guru:
// - createdByUserId NULL  -> legacy / buatan admin (global), guru boleh lihat (read-only)
// - createdByUserId == guru -> milik sendiri, boleh lihat & edit
// - createdByUserId admin  -> global, guru boleh lihat (read-only)
// - createdByUserId guru lain -> TIDAK boleh lihat
export function isVisibleToTeacher(
  createdByUserId: string | null | undefined,
  teacherId: string,
  adminIds: string[],
): boolean {
  if (!createdByUserId) return true;
  if (createdByUserId === teacherId) return true;
  return adminIds.includes(createdByUserId);
}

// Tentukan pemilik saat create:
// - TEACHER: selalu = user sendiri (tidak bisa mengatasnamakan guru lain).
// - ADMIN: boleh mengatasnamakan guru tertentu (import atas nama guru),
//   bila tidak diisi → milik admin sendiri.
export function resolveOwnerId(
  input: { createdByUserId?: string | null },
  authUser?: AuthUser,
): string {
  if (authUser?.role === "ADMIN" && input.createdByUserId) return input.createdByUserId;
  return authUser!.id;
}
