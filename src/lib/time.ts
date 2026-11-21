// Semua tanggal ditampilkan dan dihitung dalam zona waktu Jakarta (WIB),
// karena server online (mis. Vercel) berjalan dalam UTC.
export const TZ = "Asia/Jakarta";
const OFFSET = "+07:00";

/** Tanggal kalender di Jakarta, format YYYY-MM-DD. */
export function jakartaDay(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function startOfDay(day: string) {
  return new Date(`${day}T00:00:00${OFFSET}`);
}

export function endOfDay(day: string) {
  return new Date(`${day}T23:59:59.999${OFFSET}`);
}

/** Tanggal dari form: hari ini = waktu sekarang, hari lain = awal hari itu. */
export function formDate(day: string) {
  return day === jakartaDay() ? new Date() : startOfDay(day);
}

export function fmtDate(d: Date) {
  return d.toLocaleDateString("id-ID", { timeZone: TZ });
}

export function fmtDateTime(d: Date, dateStyle: "short" | "full" = "short", locale = "id-ID") {
  return d.toLocaleString(locale, { timeZone: TZ, dateStyle, timeStyle: "short" });
}
