import { test } from "node:test";
import assert from "node:assert/strict";
import { makeT, langFromAcceptLanguage } from "../src/lib/i18n-core";
import { EN } from "../src/lib/i18n-en";
import { BusinessError } from "../src/lib/services";
import { buildReceipt, DEFAULT_RECEIPT } from "../src/lib/receipt";

test("terjemahan: isi variabel, konteks, dan teks yang belum ada di kamus", () => {
  const id = makeT("id");
  const en = makeT("en");
  assert.equal(id("PIN salah. Sisa percobaan: {n}.", { n: 2 }), "PIN salah. Sisa percobaan: 2.");
  assert.equal(en("PIN salah. Sisa percobaan: {n}.", { n: 2 }), "Wrong PIN. Attempts left: 2.");
  assert.equal(id("Produk|menu"), "Produk");
  assert.equal(en("Produk|menu"), "Products");
  assert.equal(en("Produk"), "Product");
  assert.equal(en("Teks baru yang belum diterjemahkan"), "Teks baru yang belum diterjemahkan");
  assert.equal(en(undefined), "");
});

test("kamus Inggris memakai variabel yang sama dengan teks Indonesia", () => {
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const [k, v] of Object.entries(EN)) assert.equal(vars(v), vars(k.split("|")[0]), k);
});

test("bahasa dari browser: Indonesia untuk id, selain itu Inggris", () => {
  assert.equal(langFromAcceptLanguage("id-ID,id;q=0.9,en;q=0.8"), "id");
  assert.equal(langFromAcceptLanguage("en-MY,ms;q=0.9"), "en");
  assert.equal(langFromAcceptLanguage(null), "id");
});

test("pesan BusinessError tetap terbaca di log dan bisa diterjemahkan", () => {
  const e = new BusinessError("Isi jumlah yang diterima dalam {cur}.", { cur: "MYR" });
  assert.equal(e.message, "Isi jumlah yang diterima dalam MYR.");
  assert.equal(makeT("en")(e.key, e.vars), "Enter the amount received in MYR.");
});

test("struk dalam bahasa Inggris", () => {
  const sale = {
    number: "NM-20261121-0001", date: new Date("2026-11-21T05:00:00Z"), channel: "OFFLINE", marketplace: null, externalRef: null,
    currency: "MYR", rateToIdr: 3650, subtotal: 5000, discount: 500, total: 4500, status: "PAID",
    cashier: { name: "Sari" }, event: null,
    items: [{ qty: 1, price: 5000, variant: { sku: "PSC-HTM", color: "Hitam", size: null, product: { name: "Pashmina" } } }],
    payments: [{ method: "CASH", amount: 4500 }],
  };
  const text = buildReceipt(sale, DEFAULT_RECEIPT, makeT("en")).map((l) => l.text).join("\n");
  for (const s of ["STORE", "Date", "Cashier", "Offline store", "Discount", "Cash", "Rate 1 MYR = Rp", "Thank you for shopping"]) assert.match(text, new RegExp(s));
  assert.doesNotMatch(text, /Tanggal|Kasir|Terima kasih/);
});
