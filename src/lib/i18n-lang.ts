// Bagian kecil dari sistem bahasa yang juga dipakai middleware (tanpa kamus).
export type Lang = "id" | "en";
export const LANGS: Lang[] = ["id", "en"];
export const LANG_COOKIE = "mgpos_lang";

/** Pilih bahasa dari header Accept-Language: Indonesia kalau browser memakai bahasa Indonesia, selain itu Inggris. */
export function langFromAcceptLanguage(header: string | null): Lang {
  if (!header) return "id";
  return /(^|,)\s*id\b/i.test(header) ? "id" : "en";
}
