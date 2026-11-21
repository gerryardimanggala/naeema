// Aturan kode toko (slug) yang dipakai untuk masuk.

const RESERVED = new Set(["admin", "api", "masuk", "daftar", "keluar", "login", "app", "www", "pos", "toko"]);

export function normalizeSlug(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Kembalikan pesan kesalahan, atau null kalau kode toko valid. */
export function slugProblem(slug: string): string | null {
  if (slug.length < 3 || slug.length > 30) return "Kode toko harus 3 sampai 30 karakter.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "Kode toko hanya boleh huruf kecil, angka, dan tanda minus (mis. toko-ani).";
  if (RESERVED.has(slug)) return `Kode toko "${slug}" tidak bisa dipakai. Pilih kode lain.`;
  return null;
}
