// Inti terjemahan, dipakai di server dan browser.
// Teks sumber ditulis dalam bahasa Indonesia; kamus EN memetakan teks Indonesia ke bahasa Inggris.
// Teks yang belum ada di kamus tetap tampil dalam bahasa Indonesia.
import { EN } from "./i18n-en";

export type Lang = "id" | "en";
export const LANGS: Lang[] = ["id", "en"];
export const LANG_COOKIE = "mgpos_lang";
export type Vars = Record<string, string | number>;
export type T = (text: string | null | undefined, vars?: Vars) => string;

export function interpolate(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * Kunci boleh punya konteks setelah "|", mis. "Produk|menu", supaya satu kata Indonesia
 * bisa punya terjemahan berbeda. Konteks tidak pernah tampil.
 */
export function makeT(lang: Lang): T {
  return (text, vars) => {
    if (!text) return "";
    const base = text.split("|")[0];
    return interpolate(lang === "en" ? (EN[text] ?? EN[base] ?? base) : base, vars);
  };
}

/** Pilih bahasa dari header Accept-Language: Indonesia kalau browser memakai bahasa Indonesia, selain itu Inggris. */
export function langFromAcceptLanguage(header: string | null): Lang {
  if (!header) return "id";
  return /(^|,)\s*id\b/i.test(header) ? "id" : "en";
}

export function locale(lang: Lang) {
  return lang === "en" ? "en-GB" : "id-ID";
}
