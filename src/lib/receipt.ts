// Menyusun isi struk sebagai baris teks lebar tetap (monospace).
// Dipakai untuk cetak lewat browser maupun ESC/POS (Bluetooth), jadi hasilnya sama.
import { formatMoney, formatRate } from "./money";
import { CHANNELS, MARKETPLACES, PAYMENT_METHODS } from "./constants";
import { fmtDateTime } from "./time";
import { makeT, type T } from "./i18n-core";

export type ReceiptSettings = {
  storeName: string;
  address: string;
  phone: string;
  footer: string;
  paperWidth: "58" | "80";
  showLogo: string; // "1" = cetak logo toko di atas struk
};

export const DEFAULT_RECEIPT: ReceiptSettings = {
  storeName: "",
  address: "",
  phone: "",
  footer: "Terima kasih telah berbelanja",
  paperWidth: "58",
  showLogo: "1",
};

export const RECEIPT_KEYS = Object.keys(DEFAULT_RECEIPT) as (keyof ReceiptSettings)[];

/** Jumlah karakter per baris untuk font standar printer thermal. */
export function receiptColumns(width: "58" | "80") {
  return width === "80" ? 48 : 32;
}

export type ReceiptSale = {
  number: string;
  date: Date;
  channel: string;
  marketplace: string | null;
  externalRef: string | null;
  currency: string;
  rateToIdr: number;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  cashier: { name: string };
  event: { name: string } | null;
  items: { qty: number; price: number; variant: { sku: string; color: string | null; size: string | null; product: { name: string } } }[];
  payments: { method: string; amount: number }[];
};

export type ReceiptLine = { text: string; bold?: boolean; center?: boolean; big?: boolean };

/** Hanya karakter ASCII yang aman untuk semua printer thermal. */
export function ascii(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ | /g, " ")
    .replace(/[^\x20-\x7e]/g, "");
}

function wrap(text: string, cols: number): string[] {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w.slice(0, cols);
    else if (line.length + 1 + w.length <= cols) line += " " + w;
    else {
      out.push(line);
      line = w.slice(0, cols);
    }
  }
  if (line) out.push(line);
  return out;
}

/** Teks kiri dan kanan dalam satu baris; kiri dipotong bila tidak muat. */
export function leftRight(left: string, right: string, cols: number) {
  const r = ascii(right);
  const l = ascii(left).slice(0, Math.max(0, cols - r.length - 1));
  return l + " ".repeat(Math.max(1, cols - l.length - r.length)) + r;
}

/** t: bahasa struk (bawaan Indonesia). Footer bawaan ikut diterjemahkan; footer buatan toko tampil apa adanya. */
export function buildReceipt(sale: ReceiptSale, s: ReceiptSettings, t: T = makeT("id")): ReceiptLine[] {
  const cols = receiptColumns(s.paperWidth);
  const money = (v: number) => formatMoney(v, sale.currency);
  const rule = { text: "-".repeat(cols) };
  const lines: ReceiptLine[] = [];

  lines.push(...wrap(s.storeName || t("TOKO"), cols).map((text) => ({ text, bold: true, center: true, big: true })));
  for (const x of [s.address, s.phone]) if (x) lines.push(...wrap(x, cols).map((text) => ({ text, center: true })));
  lines.push(rule);

  lines.push({ text: leftRight(t("No"), sale.number, cols) });
  lines.push({ text: leftRight(t("Tanggal"), fmtDateTime(sale.date), cols) });
  lines.push({ text: leftRight(t("Kasir"), sale.cashier.name, cols) });
  const source = sale.event?.name ?? t(sale.marketplace ? MARKETPLACES[sale.marketplace] : CHANNELS[sale.channel]);
  if (source) lines.push(...wrap(source, cols).map((text) => ({ text })));
  if (sale.externalRef) lines.push({ text: leftRight(t("Pesanan"), sale.externalRef, cols) });
  if (sale.status === "VOID") lines.push({ text: t("*** DIBATALKAN ***"), bold: true, center: true });
  lines.push(rule);

  for (const i of sale.items) {
    const detail = [i.variant.color, i.variant.size].filter(Boolean).join("/");
    lines.push(...wrap(`${i.variant.product.name}${detail ? " " + detail : ""}`, cols).map((text) => ({ text })));
    lines.push({ text: leftRight(`  ${i.qty} x ${money(i.price)}`, money(i.qty * i.price), cols) });
  }
  lines.push(rule);

  if (sale.discount > 0) {
    lines.push({ text: leftRight(t("Subtotal"), money(sale.subtotal), cols) });
    lines.push({ text: leftRight(t("Diskon"), "-" + money(sale.discount), cols) });
  }
  lines.push({ text: leftRight("TOTAL", money(sale.total), cols), bold: true });
  for (const p of sale.payments) lines.push({ text: leftRight(t(PAYMENT_METHODS[p.method] ?? p.method), money(p.amount), cols) });
  if (sale.currency !== "IDR") lines.push({ text: t("Kurs 1 {cur} = Rp {rate}", { cur: sale.currency, rate: ascii(formatRate(sale.rateToIdr)) }) });
  lines.push(rule);

  if (s.footer) lines.push(...wrap(s.footer === DEFAULT_RECEIPT.footer ? t(s.footer) : s.footer, cols).map((text) => ({ text, center: true })));
  return lines.map((l) => ({ ...l, text: ascii(l.text) }));
}
