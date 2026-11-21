// Logo toko: diunggah saat daftar atau di Pengaturan, tampil di halaman masuk, menu, dan struk.
import { BusinessError } from "./services";

export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

/** Kenali jenis gambar dari isi file, bukan dari nama atau tipe yang dikirim browser. */
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return "image/webp";
  return null;
}

export async function readLogo(fd: FormData, required: boolean, key = "logo") {
  const file = fd.get(key);
  if (!(file instanceof File) || file.size === 0) {
    if (required) throw new BusinessError("Logo toko wajib diunggah.");
    return null;
  }
  if (file.size > LOGO_MAX_BYTES) throw new BusinessError("Ukuran logo maksimal 512 KB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) throw new BusinessError("Logo harus berupa gambar PNG, JPG, atau WEBP.");
  return { bytes, mime };
}

export function logoUrl(b: { slug: string; logoAt: Date | null }) {
  return b.logoAt ? `/api/logo/${b.slug}?v=${b.logoAt.getTime()}` : null;
}
