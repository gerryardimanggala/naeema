// Inti terjemahan, dipakai di server dan browser.
// Teks sumber ditulis dalam bahasa Indonesia; kamus EN memetakan teks Indonesia ke bahasa Inggris.
// Teks yang belum ada di kamus tetap tampil dalam bahasa Indonesia.
import { EN } from "./i18n-en";

import type { Lang } from "./i18n-lang";
export { LANG_COOKIE, LANGS, langFromAcceptLanguage, type Lang } from "./i18n-lang";
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

export function locale(lang: Lang) {
  return lang === "en" ? "en-GB" : "id-ID";
}
