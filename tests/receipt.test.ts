import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReceipt, leftRight, ascii, DEFAULT_RECEIPT, type ReceiptSale } from "../src/lib/receipt";
import { receiptToEscPos } from "../src/lib/escpos";

const sale: ReceiptSale = {
  number: "NM-20261121-0001",
  date: new Date("2026-11-21T05:00:00Z"),
  channel: "EVENT",
  marketplace: null,
  externalRef: null,
  currency: "MYR",
  rateToIdr: 3650,
  subtotal: 20900,
  discount: 500,
  total: 20400,
  status: "PAID",
  cashier: { name: "Sari" },
  event: { name: "Hijab Fest Kuala Lumpur" },
  items: [
    { qty: 2, price: 3500, variant: { sku: "PSC-HITA", color: "Hitam", size: null, product: { name: "Pashmina Ceruty" } } },
    { qty: 1, price: 13900, variant: { sku: "MKR-PUTI", color: "Putih", size: "All size", product: { name: "Mukena Katun Rayon Premium Extra Panjang" } } },
  ],
  payments: [{ method: "CASH", amount: 20400 }],
};

for (const paperWidth of ["58", "80"] as const) {
  test(`struk ${paperWidth}mm: tidak ada baris melebihi lebar kertas dan hanya ASCII`, () => {
    const cols = paperWidth === "80" ? 48 : 32;
    const lines = buildReceipt(sale, { ...DEFAULT_RECEIPT, paperWidth, address: "Jl. Contoh No. 1, Bandung" });
    for (const l of lines) {
      assert.ok(l.text.length <= cols, `terlalu panjang: "${l.text}"`);
      assert.match(l.text, /^[\x20-\x7e]*$/);
    }
    const all = lines.map((l) => l.text).join("\n");
    assert.match(all, /TOTAL\s+RM 204,00/);
    assert.match(all, /Diskon\s+-RM 5,00/);
    assert.match(all, /Kurs 1 MYR = Rp 3\.650/);
    assert.match(all, /21\/11\/26.*12[.:]00/); // 05:00 UTC = 12:00 WIB
  });
}

test("leftRight dan ascii", () => {
  assert.equal(leftRight("TOTAL", "Rp 10", 12), "TOTAL  Rp 10");
  assert.equal(ascii("Café − “ok”"), 'Cafe - "ok"');
});

test("ESC/POS diawali reset dan diakhiri potong kertas", () => {
  const bytes = receiptToEscPos([{ text: "HALO", bold: true, center: true }]);
  assert.deepEqual([...bytes.slice(0, 2)], [0x1b, 0x40]);
  assert.deepEqual([...bytes.slice(-4)], [0x1d, 0x56, 0x42, 0x00]);
  assert.ok(new TextDecoder().decode(bytes).includes("HALO\n"));
});
