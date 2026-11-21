"use server";
// Aksi admin platform: mengatur pendaftaran, toko, dan akun di semua toko.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ADMIN_COOKIE, ADMIN_SESSION_HOURS, requirePlatformAdmin } from "@/lib/admin-session";
import { hashPin, verifyPin, newSessionToken, PIN_RULE, MAX_FAILED_LOGINS, LOCK_MINUTES } from "@/lib/auth";
import { readLogo } from "@/lib/logo";
import { BusinessError } from "@/lib/services";
import { normalizeSlug, slugProblem } from "@/lib/business";
import { SIGNUP_MODES, createBusinessWithOwner, setPlatformSetting } from "@/lib/platform";

// ---------- masuk & keluar ----------

function loginError(msg: string): never {
  redirect("/admin/masuk?error=" + encodeURIComponent(msg));
}

async function startAdminSession(adminId: number) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 3600e3);
  await db.adminSession.create({ data: { token, adminId, expiresAt } });
  await db.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function adminLogin(fd: FormData) {
  const name = text(fd, "name");
  const pin = text(fd, "pin");
  const admin = name ? await db.platformAdmin.findFirst({ where: { name: { equals: name, mode: "insensitive" }, active: true } }) : null;
  // Pesan yang sama untuk nama salah dan PIN salah, supaya nama admin tidak bisa ditebak.
  if (!admin) loginError("Nama atau PIN salah.");
  if (admin.lockedUntil && admin.lockedUntil > new Date())
    loginError(`Terlalu banyak PIN salah. Coba lagi setelah ${LOCK_MINUTES} menit.`);
  if (!verifyPin(pin, admin.pinHash)) {
    const failed = admin.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.platformAdmin.update({
      where: { id: admin.id },
      data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null },
    });
    loginError(lock ? `PIN salah ${MAX_FAILED_LOGINS} kali. Akun admin dikunci ${LOCK_MINUTES} menit.` : "Nama atau PIN salah.");
  }
  await db.platformAdmin.update({ where: { id: admin.id }, data: { failedLogins: 0, lockedUntil: null } });
  await startAdminSession(admin.id);
  redirect("/admin");
}

export async function adminLogout() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) await db.adminSession.deleteMany({ where: { token } });
  store.delete(ADMIN_COOKIE);
  redirect("/admin/masuk");
}

/** Hanya bisa dipakai sekali, saat belum ada admin sama sekali (instalasi baru). */
export async function setupFirstAdmin(fd: FormData) {
  const name = text(fd, "name");
  const pin = text(fd, "pin");
  if (!name) loginError("Nama wajib diisi.");
  if (!PIN_RULE.test(pin)) loginError("PIN harus 4 sampai 8 angka.");
  if (pin !== text(fd, "pin2")) loginError("Kedua PIN tidak sama.");
  const admin = await db.$transaction(async (tx) => {
    if (await tx.platformAdmin.count()) return null;
    return tx.platformAdmin.create({ data: { name, pinHash: hashPin(pin) } });
  });
  if (!admin) loginError("Admin sudah ada. Silakan masuk.");
  await startAdminSession(admin.id);
  redirect("/admin");
}

// ---------- akun admin ----------

export async function createPlatformAdmin(fd: FormData) {
  await requirePlatformAdmin();
  await attempt("/admin/akun", "Admin ditambahkan.", async () => {
    const name = text(fd, "name").slice(0, 60);
    const pin = text(fd, "pin");
    if (!name) throw new BusinessError("Nama wajib diisi.");
    if (!PIN_RULE.test(pin)) throw new BusinessError("PIN harus 4 sampai 8 angka.");
    if (await db.platformAdmin.findFirst({ where: { name: { equals: name, mode: "insensitive" } } }))
      throw new BusinessError(`Nama admin "${name}" sudah dipakai.`);
    await db.platformAdmin.create({ data: { name, pinHash: hashPin(pin) } });
  });
}

export async function resetPlatformAdminPin(fd: FormData) {
  const me = await requirePlatformAdmin();
  await attempt("/admin/akun", "PIN admin diganti.", async () => {
    const id = int(fd, "id");
    const pin = text(fd, "pin");
    if (!PIN_RULE.test(pin)) throw new BusinessError("PIN harus 4 sampai 8 angka.");
    const a = await db.platformAdmin.findUnique({ where: { id } });
    if (!a) throw new BusinessError("Admin tidak ditemukan.");
    if (id === me.id && !verifyPin(text(fd, "oldPin"), a.pinHash)) throw new BusinessError("PIN lama salah.");
    await db.platformAdmin.update({ where: { id }, data: { pinHash: hashPin(pin), failedLogins: 0, lockedUntil: null } });
    if (id !== me.id) await db.adminSession.deleteMany({ where: { adminId: id } });
  });
}

export async function togglePlatformAdmin(fd: FormData) {
  const me = await requirePlatformAdmin();
  await attempt("/admin/akun", "Status admin diubah.", async () => {
    const id = int(fd, "id");
    if (id === me.id) throw new BusinessError("Tidak bisa menonaktifkan diri sendiri.");
    const a = await db.platformAdmin.findUnique({ where: { id } });
    if (!a) throw new BusinessError("Admin tidak ditemukan.");
    await db.platformAdmin.update({ where: { id }, data: { active: !a.active } });
    if (a.active) await db.adminSession.deleteMany({ where: { adminId: id } });
  });
}

function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function int(fd: FormData, key: string) {
  const v = Number(text(fd, key));
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}

async function attempt(path: string, okMsg: string, fn: () => Promise<unknown>) {
  let error: string | null = null;
  try {
    await fn();
  } catch (e) {
    if (e instanceof BusinessError) error = e.message;
    else {
      console.error(e);
      error = "Terjadi kesalahan. Coba lagi.";
    }
  }
  revalidatePath("/", "layout");
  const q = new URLSearchParams(error ? { error } : { ok: okMsg }).toString();
  redirect(`${path}?${q}`);
}

async function findBusiness(id: number) {
  const b = await db.business.findUnique({ where: { id } });
  if (!b) throw new BusinessError("Toko tidak ditemukan.");
  return b;
}

async function findUser(id: number) {
  const u = await db.user.findUnique({ where: { id } });
  if (!u) throw new BusinessError("Pengguna tidak ditemukan.");
  return u;
}

// ---------- pendaftaran ----------

export async function saveSignupSettings(fd: FormData) {
  await requirePlatformAdmin();
  await attempt("/admin", "Pengaturan pendaftaran disimpan.", async () => {
    const mode = text(fd, "mode");
    if (!(mode in SIGNUP_MODES)) throw new BusinessError("Mode pendaftaran tidak valid.");
    const code = text(fd, "code").slice(0, 60);
    if (mode === "INVITE" && code.length < 4) throw new BusinessError("Kode undangan minimal 4 karakter.");
    await setPlatformSetting("signup.mode", mode);
    await setPlatformSetting("signup.code", code);
  });
}

// ---------- toko ----------

export async function adminCreateBusiness(fd: FormData) {
  await requirePlatformAdmin();
  await attempt("/admin", "Toko dibuat.", async () => {
    const businessName = text(fd, "businessName").slice(0, 80);
    const slug = normalizeSlug(text(fd, "store"));
    const ownerName = text(fd, "name");
    const pin = text(fd, "pin");
    if (!businessName) throw new BusinessError("Nama bisnis wajib diisi.");
    const problem = slugProblem(slug);
    if (problem) throw new BusinessError(problem);
    if (!ownerName) throw new BusinessError("Nama owner wajib diisi.");
    if (!PIN_RULE.test(pin)) throw new BusinessError("PIN owner harus 4 sampai 8 angka.");
    if (await db.business.findUnique({ where: { slug } })) throw new BusinessError(`Kode toko "${slug}" sudah dipakai.`);
    const logo = await readLogo(fd, false);
    await db.$transaction((tx) =>
      createBusinessWithOwner(tx, { businessName, slug, ownerName, pinHash: hashPin(pin), logo }),
    );
  });
}

export async function approveBusiness(fd: FormData) {
  await requirePlatformAdmin();
  await attempt("/admin", "Toko disetujui dan sudah bisa dipakai.", async () => {
    const b = await findBusiness(int(fd, "id"));
    if (!b.pending) throw new BusinessError("Toko ini tidak sedang menunggu persetujuan.");
    await db.business.update({ where: { id: b.id }, data: { pending: false, active: true } });
  });
}

/** Tolak pendaftaran: hapus toko yang masih menunggu beserta data awalnya. */
export async function rejectBusiness(fd: FormData) {
  await requirePlatformAdmin();
  await attempt("/admin", "Pendaftaran ditolak dan dihapus.", async () => {
    const b = await findBusiness(int(fd, "id"));
    if (!b.pending) throw new BusinessError("Hanya pendaftaran yang masih menunggu yang bisa ditolak. Untuk toko aktif, pakai Nonaktifkan.");
    if (await db.sale.count({ where: { businessId: b.id } })) throw new BusinessError("Toko ini sudah punya penjualan, tidak bisa dihapus.");
    await db.$transaction(async (tx) => {
      const where = { businessId: b.id };
      await tx.session.deleteMany({ where: { user: where } });
      await tx.paymentQr.deleteMany({ where });
      await tx.wallet.deleteMany({ where });
      await tx.stock.deleteMany({ where: { location: where } });
      await tx.stockMove.deleteMany({ where });
      await tx.location.deleteMany({ where });
      await tx.variantPrice.deleteMany({ where: { variant: where } });
      await tx.variant.deleteMany({ where });
      await tx.product.deleteMany({ where });
      await tx.category.deleteMany({ where });
      await tx.setting.deleteMany({ where });
      await tx.exchangeRate.deleteMany({ where });
      await tx.user.deleteMany({ where });
      await tx.business.delete({ where: { id: b.id } });
    });
  });
}

export async function toggleBusiness(fd: FormData) {
  await requirePlatformAdmin();
  const id = int(fd, "id");
  await attempt(`/admin/toko/${id}`, "Status toko diubah.", async () => {
    const b = await findBusiness(id);
    await db.business.update({ where: { id }, data: { active: !b.active } });
    // Toko dinonaktifkan: semua orang di toko itu langsung keluar.
    if (b.active) await db.session.deleteMany({ where: { user: { businessId: id } } });
  });
}

export async function renameBusiness(fd: FormData) {
  await requirePlatformAdmin();
  const id = int(fd, "id");
  await attempt(`/admin/toko/${id}`, "Data toko disimpan.", async () => {
    const name = text(fd, "name").slice(0, 80);
    if (!name) throw new BusinessError("Nama toko wajib diisi.");
    await findBusiness(id);
    const logo = await readLogo(fd, false);
    await db.business.update({
      where: { id },
      data: { name, ...(logo ? { logo: logo.bytes, logoMime: logo.mime, logoAt: new Date() } : {}) },
    });
  });
}

// ---------- akun ----------

export async function adminCreateUser(fd: FormData) {
  await requirePlatformAdmin();
  const businessId = int(fd, "businessId");
  await attempt(`/admin/toko/${businessId}`, "Pengguna ditambahkan.", async () => {
    await findBusiness(businessId);
    const name = text(fd, "name");
    const role = text(fd, "role");
    const pin = text(fd, "pin");
    if (!name) throw new BusinessError("Nama wajib diisi.");
    if (!["OWNER", "ADMIN", "STAFF"].includes(role)) throw new BusinessError("Peran tidak valid.");
    if (!PIN_RULE.test(pin)) throw new BusinessError("PIN harus 4 sampai 8 angka.");
    await db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { businessId, name, role, pinHash: hashPin(pin) } });
      await tx.wallet.create({ data: { businessId, name: `Kas ${name}`, kind: "PERSON", ownerId: u.id, currency: "IDR" } });
    });
  });
}

export async function adminResetPin(fd: FormData) {
  await requirePlatformAdmin();
  const businessId = int(fd, "businessId");
  await attempt(`/admin/toko/${businessId}`, "PIN diganti dan kunci dibuka. Sesi lama orang itu sudah diakhiri.", async () => {
    const u = await findUser(int(fd, "id"));
    const pin = text(fd, "pin");
    if (!PIN_RULE.test(pin)) throw new BusinessError("PIN harus 4 sampai 8 angka.");
    await db.user.update({ where: { id: u.id }, data: { pinHash: hashPin(pin), failedLogins: 0, lockedUntil: null } });
    await db.session.deleteMany({ where: { userId: u.id } });
  });
}

export async function adminUnlockUser(fd: FormData) {
  await requirePlatformAdmin();
  const businessId = int(fd, "businessId");
  await attempt(`/admin/toko/${businessId}`, "Kunci akun dibuka.", async () => {
    const u = await findUser(int(fd, "id"));
    await db.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null } });
  });
}

export async function adminToggleUser(fd: FormData) {
  await requirePlatformAdmin();
  const businessId = int(fd, "businessId");
  await attempt(`/admin/toko/${businessId}`, "Status pengguna diubah.", async () => {
    const u = await findUser(int(fd, "id"));
    await db.user.update({ where: { id: u.id }, data: { active: !u.active } });
    if (u.active) await db.session.deleteMany({ where: { userId: u.id } });
  });
}
