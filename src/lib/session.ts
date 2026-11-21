import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";

export const SESSION_COOKIE = "naeema_session";
/** Kode toko terakhir yang dipakai di perangkat ini, supaya halaman masuk langsung menampilkan tokonya. */
export const STORE_COOKIE = "pos_store";

export const getCurrentUser = cache(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { token }, include: { user: { include: { business: true } } } });
  if (!session || session.expiresAt < new Date() || !session.user.active || !session.user.business.active || session.user.business.pending) return null;
  return session.user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/masuk");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role === "STAFF") redirect("/?error=akses");
  return user;
}

/** Admin platform: mengatur semua toko dan akun. Tidak terikat ke data toko mana pun. */
export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!user.platformAdmin) redirect("/?error=akses");
  return user;
}

export function isAdmin(user: { role: string }) {
  return user.role === "OWNER" || user.role === "ADMIN";
}
