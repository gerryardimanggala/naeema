// Perintah ESC/POS dasar yang didukung hampir semua printer thermal.
import type { ReceiptLine } from "./receipt";

const ESC = 0x1b;
const GS = 0x1d;

export function receiptToEscPos(lines: ReceiptLine[]): Uint8Array {
  const out: number[] = [ESC, 0x40]; // reset
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
