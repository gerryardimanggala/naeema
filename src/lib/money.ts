import { CURRENCY_DECIMALS } from "./constants";

export function decimals(currency: string) {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

/** Nilai yang diketik (mis. "45.50") -> satuan terkecil (4550). */
export function toMinor(major: number | string, currency: string): number {
  const n = typeof major === "string" ? Number(major.replace(/,/g, ".")) : major;
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 10 ** decimals(currency));
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** decimals(currency);
}

/** Konversi satuan terkecil mata uang apa pun ke rupiah dengan kurs IDR per 1 unit. */
export function toIdr(minor: number, currency: string, rate: number): number {
  if (currency === "IDR") return minor;
  return Math.round(fromMinor(minor, currency) * rate);
}

export function formatMoney(minor: number, currency: string): string {
  const d = decimals(currency);
  const value = fromMinor(minor, currency);
  const num = new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
  const symbol = currency === "IDR" ? "Rp" : currency === "MYR" ? "RM" : currency === "SGD" ? "S$" : currency;
  return `${symbol} ${num}`;
}

export function formatRate(rate: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(rate);
}
