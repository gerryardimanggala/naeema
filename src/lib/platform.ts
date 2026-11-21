// Pengaturan tingkat platform (di atas semua toko) dan pembuatan bisnis baru.
import type { Prisma } from "@prisma/client";
import { db } from "./db";

export const SIGNUP_MODES = {
  OPEN: "Terbuka: siapa saja bisa daftar dan langsung pakai",
  APPROVAL: "Perlu persetujuan: toko baru aktif setelah disetujui admin platform",
  INVITE: "Pakai kode undangan: hanya yang punya kode bisa daftar",
  CLOSED: "Ditutup: hanya admin platform yang bisa membuat toko",
} as const;
export type SignupMode = keyof typeof SIGNUP_MODES;

export async function getPlatformSettings() {
  const rows = await db.platformSetting.findMany({ where: { key: { in: ["signup.mode", "signup.code"] } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  const raw = get("signup.mode");
  // Bawaan: terbuka, kecuali variabel lama SIGNUP_CODE diisi.
  const mode: SignupMode = raw in SIGNUP_MODES ? (raw as SignupMode) : process.env.SIGNUP_CODE ? "INVITE" : "OPEN";
  return { mode, code: get("signup.code") || process.env.SIGNUP_CODE || "" };
}

export async function setPlatformSetting(key: string, value: string) {
  await db.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Buat bisnis beserta owner, lokasi, dompet, dan kategori awal. */
export async function createBusinessWithOwner(
  tx: Prisma.TransactionClient,
  input: { businessName: string; slug: string; ownerName: string; pinHash: string; pending?: boolean },
) {
  const b = await tx.business.create({ data: { name: input.businessName, slug: input.slug, pending: !!input.pending } });
  const owner = await tx.user.create({
    data: { businessId: b.id, name: input.ownerName, role: "OWNER", pinHash: input.pinHash },
  });
  await tx.location.createMany({
    data: [
      { businessId: b.id, name: "Gudang", type: "WAREHOUSE" },
      { businessId: b.id, name: "Toko Offline", type: "STORE" },
    ],
  });
  await tx.wallet.createMany({
    data: [
      { businessId: b.id, name: "Rekening Bank", kind: "BANK", currency: "IDR" },
      { businessId: b.id, name: `Kas ${input.ownerName}`, kind: "PERSON", ownerId: owner.id, currency: "IDR" },
    ],
  });
  await tx.category.create({ data: { businessId: b.id, name: "Umum" } });
  return { business: b, owner };
}

/** Pesan untuk toko yang tidak bisa dipakai masuk, atau null kalau toko aktif. */
export function businessBlockReason(b: { active: boolean; pending: boolean }) {
  if (b.pending) return "Pendaftaran toko ini masih menunggu persetujuan admin.";
  if (!b.active) return "Toko ini sedang dinonaktifkan. Hubungi admin.";
  return null;
}
