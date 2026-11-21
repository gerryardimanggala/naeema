// Jalankan: npm test  (memakai database terpisah prisma/test.db)
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  createSale, voidSale, receiveStock, transferStock, adjustStock, returnAllStock,
  createCashMove, decideCashMove, walletBalances, BusinessError,
} from "../src/lib/services";

process.env.DATABASE_URL = "file:./test.db";
const db = new PrismaClient({ datasourceUrl: "file:./test.db" });

let owner: { id: number; role: string }, sari: { id: number; role: string };
let gudang: number, kl: number, eventId: number, hijab: number;
let sariMyr: number, sariIdr: number, bca: number;

before(async () => {
  rmSync("prisma/test.db", { force: true });
  execSync("npx prisma db push --skip-generate", { env: { ...process.env, DATABASE_URL: "file:./test.db" }, stdio: "ignore" });
  owner = await db.user.create({ data: { name: "Owner", role: "OWNER" } });
  sari = await db.user.create({ data: { name: "Sari", role: "STAFF" } });
  gudang = (await db.location.create({ data: { name: "Gudang", type: "WAREHOUSE" } })).id;
  const ev = await db.event.create({
    data: { name: "Hijab Fest KL", country: "MY", currency: "MYR", startDate: new Date("2026-12-12"), endDate: new Date("2026-12-15"),
      location: { create: { name: "Booth Hijab Fest KL", type: "EVENT" } } },
    include: { location: true },
  });
  eventId = ev.id; kl = ev.location!.id;
  const p = await db.product.create({ data: { name: "Pashmina Ceruty", category: "HIJAB", variants: { create: { sku: "PC-HTM", color: "Hitam", priceIdr: 89000 } } }, include: { variants: true } });
  hijab = p.variants[0].id;
  sariMyr = (await db.wallet.create({ data: { name: "Sari MYR", kind: "PERSON", ownerId: sari.id, currency: "MYR" } })).id;
  sariIdr = (await db.wallet.create({ data: { name: "Sari IDR", kind: "PERSON", ownerId: sari.id, currency: "IDR" } })).id;
  bca = (await db.wallet.create({ data: { name: "BCA Naeema", kind: "BANK", currency: "IDR" } })).id;
});

const qty = async (loc: number) => (await db.stock.findUnique({ where: { variantId_locationId: { variantId: hijab, locationId: loc } } }))?.qty ?? 0;

test("stok masuk lalu dipindah ke booth pameran", async () => {
  await receiveStock(db, owner.id, { locationId: gudang, lines: [{ variantId: hijab, qty: 100 }] });
  await transferStock(db, owner.id, { fromLocationId: gudang, toLocationId: kl, lines: [{ variantId: hijab, qty: 40 }] });
  assert.equal(await qty(gudang), 60);
  assert.equal(await qty(kl), 40);
  await assert.rejects(transferStock(db, owner.id, { fromLocationId: gudang, toLocationId: kl, lines: [{ variantId: hijab, qty: 999 }] }), BusinessError);
});

test("penjualan MYR di pameran: kurs dikunci, stok berkurang, uang masuk dompet Sari", async () => {
  const sale = await createSale(db, sari.id, {
    channel: "EVENT", eventId, locationId: kl, currency: "MYR", rateToIdr: 3500,
    items: [{ variantId: hijab, qty: 2, price: 4500 }], discount: 500,
    payments: [{ method: "CASH", amount: 8500, walletId: sariMyr }],
  });
  assert.equal(sale.total, 8500); // RM 85,00
  assert.equal(sale.totalIdr, 297500);
  assert.match(sale.number, /^NM-\d{8}-0001$/);
  assert.equal(await qty(kl), 38);
  const b = (await walletBalances(db)).get(sariMyr)!;
  assert.equal(b.balance, 8500);
});

test("validasi penjualan", async () => {
  const base = { channel: "EVENT" as const, eventId, locationId: kl, currency: "MYR", rateToIdr: 3500, items: [{ variantId: hijab, qty: 1, price: 4500 }], discount: 0 };
  await assert.rejects(createSale(db, sari.id, { ...base, payments: [{ method: "CASH", amount: 4000, walletId: sariMyr }] }), /harus sama dengan total/);
  await assert.rejects(createSale(db, sari.id, { ...base, payments: [{ method: "CASH", amount: 4500, walletId: sariIdr }] }), /memakai IDR/);
  await assert.rejects(createSale(db, sari.id, { ...base, locationId: gudang, payments: [{ method: "CASH", amount: 4500, walletId: sariMyr }] }), /lokasi event/);
});

test("pengeluaran langsung mengurangi saldo; setoran menunggu konfirmasi", async () => {
  await createCashMove(db, sari, { type: "EXPENSE", fromWalletId: sariMyr, amount: 1500, eventId, category: "TRANSPORT" });
  let b = (await walletBalances(db)).get(sariMyr)!;
  assert.equal(b.balance, 7000);

  const dep = await createCashMove(db, sari, { type: "DEPOSIT", fromWalletId: sariMyr, toWalletId: bca, amount: 6000, toAmount: 210000 });
  assert.equal(dep.status, "PENDING");
  b = (await walletBalances(db)).get(sariMyr)!;
  assert.equal(b.balance, 7000);
  assert.equal(b.pendingOut, 6000);

  await assert.rejects(decideCashMove(db, sari, dep.id, true), BusinessError); // staf tidak bisa konfirmasi setorannya sendiri
  await decideCashMove(db, owner, dep.id, true);
  const all = await walletBalances(db);
  assert.equal(all.get(sariMyr)!.balance, 1000); // sisa RM 10 dipegang Sari
  assert.equal(all.get(bca)!.balance, 210000); // diterima dalam rupiah sesuai kurs tukar asli
});

test("staf tidak bisa mencatat uang dari dompet orang lain", async () => {
  await assert.rejects(createCashMove(db, sari, { type: "EXPENSE", fromWalletId: bca, amount: 100 }), /dompet sendiri/);
});

test("batal jual mengembalikan stok dan uang", async () => {
  const sale = await createSale(db, sari.id, {
    channel: "EVENT", eventId, locationId: kl, currency: "MYR", rateToIdr: 3500,
    items: [{ variantId: hijab, qty: 1, price: 4500 }], discount: 0,
    payments: [{ method: "CASH", amount: 4500, walletId: sariMyr }],
  });
  assert.equal(await qty(kl), 37);
  await voidSale(db, owner.id, sale.id, "salah input");
  assert.equal(await qty(kl), 38);
  assert.equal((await walletBalances(db)).get(sariMyr)!.balance, 1000);
});

test("stock opname dan pengembalian sisa stok pameran", async () => {
  await adjustStock(db, owner.id, { locationId: kl, variantId: hijab, countedQty: 37 });
  assert.equal(await qty(kl), 37);
  await returnAllStock(db, owner.id, kl, gudang);
  assert.equal(await qty(kl), 0);
  assert.equal(await qty(gudang), 97);
});
