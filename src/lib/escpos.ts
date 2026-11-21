// Perintah ESC/POS dasar yang didukung hampir semua printer thermal.
import type { ReceiptLine } from "./receipt";

const ESC = 0x1b;
const GS = 0x1d;

/** Gambar hitam-putih: 1 bit per titik, baris dikemas per 8 titik (bit tertinggi = titik paling kiri). */
export type Raster = { width: number; height: number; data: Uint8Array };

/** Lebar logo di struk, dalam titik printer (203 dpi: 58 mm ≈ 384 titik, 80 mm ≈ 576 titik). */
export function logoDots(paperWidth: "58" | "80") {
  return paperWidth === "80" ? 320 : 256;
}

/**
 * Ubah piksel RGBA menjadi raster hitam-putih dengan dithering Floyd-Steinberg,
 * supaya logo berwarna tetap terbaca di printer thermal. Bagian transparan dianggap putih.
 */
export function rgbaToRaster(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Raster {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const lum = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    gray[i] = lum * a + 255 * (1 - a);
  }
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = gray[i];
      const black = old < 128;
      if (black) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      const err = old - (black ? 0 : 255);
      if (x + 1 < width) gray[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) gray[i + width - 1] += (err * 3) / 16;
        gray[i + width] += (err * 5) / 16;
        if (x + 1 < width) gray[i + width + 1] += err / 16;
      }
    }
  }
  return { width, height, data };
}

/** GS v 0, dipecah per 64 baris karena printer murah sering punya buffer kecil. */
function rasterCommands(r: Raster): number[] {
  const out: number[] = [];
  const bytesPerRow = Math.ceil(r.width / 8);
  for (let y0 = 0; y0 < r.height; y0 += 64) {
    const h = Math.min(64, r.height - y0);
    out.push(GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8);
    for (const b of r.data.subarray(y0 * bytesPerRow, (y0 + h) * bytesPerRow)) out.push(b);
  }
  return out;
}

export function receiptToEscPos(lines: ReceiptLine[], logo?: Raster | null): Uint8Array {
  const out: number[] = [ESC, 0x40]; // reset
  if (logo) {
    out.push(ESC, 0x61, 1); // tengah
    out.push(...rasterCommands(logo), 0x0a);
  }
  const enc = new TextEncoder();
  for (const l of lines) {
    out.push(ESC, 0x61, l.center ? 1 : 0); // perataan
    out.push(ESC, 0x45, l.bold ? 1 : 0); // tebal
    out.push(GS, 0x21, l.big ? 0x01 : 0x00); // tinggi ganda untuk nama toko
    out.push(...enc.encode(l.text), 0x0a);
  }
  out.push(ESC, 0x45, 0, GS, 0x21, 0, ESC, 0x61, 0);
  out.push(0x0a, 0x0a, 0x0a); // dorong kertas sebelum dipotong
  out.push(GS, 0x56, 0x42, 0x00); // potong kertas (diabaikan printer tanpa pemotong)
  return Uint8Array.from(out);
}
