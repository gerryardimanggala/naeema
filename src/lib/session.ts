import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { businessSubscription } from "./platform";
import { isLocked } from "./subscription";

export const SESSION_COOKIE = "naeema_session";
/** Kode toko terakhir yang dipakai di perangkat ini, supaya halaman masuk langsung menampilkan tokonya. */
export const STORE_COOKIE = "pos_store";

export const getCurrentUser = cache(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { token }, include: { user: { include: { business: { omit: { logo: true } } } } } });
  if (!session || session.expiresAt < new Date() || !session.user.active || !session.user.business.active || session.user.business.pending) return null;
  return session.user;
});

/** Pengguna yang sudah masuk. Kalau langganan tokonya habis, diarahkan ke halaman langganan. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isLocked(await businessSubscription(user.business))) redirect("/langganan");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role === "STAFF") redirect("/?error=akses");
  return user;
}

export function isAdmin(user: { role: string }) {
  return user.role === "OWNER" || user.role === "ADMIN";
}
