import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

// Versi pertama: pengguna memilih namanya (belum ada password).
// Login dengan PIN/password direncanakan sebelum dipakai di luar uji coba.
export const USER_COOKIE = "naeema_user";

export async function getCurrentUser() {
  const store = await cookies();
  const id = Number(store.get(USER_COOKIE)?.value);
  if (!id) return null;
  return db.user.findFirst({ where: { id, active: true } });
}

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

export function isAdmin(user: { role: string }) {
  return user.role === "OWNER" || user.role === "ADMIN";
}
