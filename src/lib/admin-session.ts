// Sesi admin MG-POS. Terpisah total dari sesi akun toko (cookie dan tabel berbeda).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";

export const ADMIN_COOKIE = "mgpos_admin";
/** Sesi admin lebih pendek dari sesi toko karena aksesnya lebih luas. */
export const ADMIN_SESSION_HOURS = 12;

export const getCurrentAdmin = cache(async () => {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const s = await db.adminSession.findUnique({ where: { token }, include: { admin: true } });
  if (!s || s.expiresAt < new Date() || !s.admin.active) return null;
  return s.admin;
});

export async function requirePlatformAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
