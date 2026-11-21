// Langganan toko. Tidak ada pembayaran otomatis: admin MG-POS mencatat pembayaran dan memperpanjang masa aktif.
import { endOfDay, jakartaDay } from "./time";

export const REMIND_DAYS = 7;
export const MONTH_CHOICES = [1, 3, 6, 12];

export type SubSettings = { priceMonthly: number; trialDays: number; graceDays: number; payInfo: string };
export const DEFAULT_SUB: SubSettings = { priceMonthly: 0, trialDays: 14, graceDays: 3, payInfo: "" };
export const SUB_KEYS = { priceMonthly: "sub.priceMonthly", trialDays: "sub.trialDays", graceDays: "sub.graceDays", payInfo: "sub.payInfo" } as const;

export function parseSubSettings(get: (key: string) => string | undefined): SubSettings {
  const num = (k: string, d: number) => {
    const v = Number(get(k));
    return Number.isFinite(v) && v >= 0 && get(k) !== "" && get(k) != null ? Math.trunc(v) : d;
  };
  return {
    priceMonthly: num(SUB_KEYS.priceMonthly, DEFAULT_SUB.priceMonthly),
    trialDays: num(SUB_KEYS.trialDays, DEFAULT_SUB.trialDays),
    graceDays: num(SUB_KEYS.graceDays, DEFAULT_SUB.graceDays),
    payInfo: get(SUB_KEYS.payInfo) ?? "",
  };
}

export type SubState =
  | { kind: "free" }
  | { kind: "none" } // belum pernah diatur: dianggap habis
  | { kind: "active" | "expiring"; until: Date; daysLeft: number }
  | { kind: "grace"; until: Date; graceLeft: number }
  | { kind: "expired"; until: Date };

const DAY = 864e5;

/** Selisih hari kalender (WIB) dari hari ini ke tanggal itu. 0 = hari ini. */
function daysBetween(from: Date, to: Date) {
  return Math.round((Date.parse(jakartaDay(to)) - Date.parse(jakartaDay(from))) / DAY);
}

export function subscriptionState(b: { freePlan: boolean; paidUntil: Date | null }, graceDays: number, now = new Date()): SubState {
  if (b.freePlan) return { kind: "free" };
  if (!b.paidUntil) return { kind: "none" };
  const until = b.paidUntil;
  if (until >= now) {
    const daysLeft = daysBetween(now, until);
    return { kind: daysLeft <= REMIND_DAYS ? "expiring" : "active", until, daysLeft };
  }
  const graceEnd = new Date(until.getTime() + graceDays * DAY);
  if (graceEnd >= now) return { kind: "grace", until, graceLeft: Math.max(0, daysBetween(now, graceEnd)) };
  return { kind: "expired", until };
}

/** Toko yang langganannya habis (lewat masa tenggang) hanya bisa membuka halaman langganan. */
export function isLocked(s: SubState) {
  return s.kind === "expired" || s.kind === "none";
}

/** Tambah bulan kalender ke tanggal YYYY-MM-DD; tanggal 31 Jan + 1 bulan = 28/29 Feb. */
export function addMonths(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * Masa aktif baru setelah perpanjangan. Kalau masih aktif, dihitung dari tanggal habis lama;
 * kalau sudah habis, dihitung dari hari ini (masa yang terlewat tidak ditagih).
 */
export function extendUntil(paidUntil: Date | null, months: number, now = new Date()) {
  const base = paidUntil && paidUntil >= now ? jakartaDay(paidUntil) : jakartaDay(now);
  return endOfDay(addMonths(base, months));
}

/** Masa coba untuk toko baru. */
export function trialUntil(trialDays: number, now = new Date()) {
  return endOfDay(jakartaDay(new Date(now.getTime() + trialDays * DAY)));
}
