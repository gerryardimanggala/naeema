// Jalankan: TEST_DATABASE_URL=postgresql://... npm test
// Memakai database Postgres terpisah; SEMUA ISINYA DIHAPUS setiap tes berjalan.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import {
  createSale, voidSale, receiveStock, transferStock, adjustStock, returnAllStock,
  createCashMove, decideCashMove, walletBalances, BusinessError, type Actor,
} from "../src/lib/services";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("Isi TEST_DATABASE_URL dengan database Postgres khusus tes.");
if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL tidak boleh sama dengan DATABASE_URL.");
const db = new PrismaClient({ datasourceUrl: url });

let owner: Actor, sari: Actor, other: Actor;
let gudang: number, kl: number, eventId: number, hijab: number;
let sariMyr: number, sariIdr: number, bca: number;
let bId: number;
// Data bisnis kedua, untuk memastikan data antar bisnis tidak bisa saling dipakai.
let otherGudang: number, otherVariant: number, otherWallet: number;

before(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url }, stdio: "ignore" });
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  const a = (bId = (await db.business.create({ data: { name: "Naeema", slug: "naeema" } })).id);
  owner = await db.user.create({ data: { businessId: a, name: "Owner", role: "OWNER" } });
  sari = await db.user.create({ data: { businessId: a, name: "Sari", role: "STAFF" } });
  gudang = (await db.location.create({ data: { businessId: a, name: "Gudang", type: "WAREHOUSE" } })).id;
  const ev = await db.event.create({
    data: { businessId: a, name: "Hijab Fest KL", country: "MY", currency: "MYR", startDate: new Date("2026-12-12"), endDate: new Date("2026-12-15"),
      location: { create: { businessId: a, name: "Booth Hijab Fest KL", type: "EVENT" } } },
    include: { location: true },
  });
  eventId = ev.id; kl = ev.location!.id;
  const cat = await db.category.create({ data: { businessId: a, name: "Hijab" } });
  const p = await db.product.create({
    data: { businessId: a, name: "Pashmina Ceruty", categoryId: cat.id, variants: { create: { businessId: a, sku: "PC-HTM", color: "Hitam", priceIdr: 89000 } } },
    include: { variants: true },
  });
  hijab = p.variants[0].id;
  sariMyr = (await db.wallet.create({ data: { businessId: a, name: "Sari MYR", kind: "PERSON", ownerId: sari.id, currency: "MYR" } })).id;
  sariIdr = (await db.wallet.create({ data: { businessId: a, name: "Sari IDR", kind: "PERSON", ownerId: sari.id, currency: "IDR" } })).id;
  bca = (await db.wallet.create({ data: { businessId: a, name: "BCA Naeema", kind: "BANK", currency: "IDR" } })).id;

  const b = (await db.business.create({ data: { name: "Toko Lain", slug: "toko-lain" } })).id;
  other = await db.user.create({ data: { businessId: b, name: "Owner Lain", role: "OWNER" } });
  otherGudang = (await db.location.create({ data: { businessId: b, name: "Gudang", type: "WAREHOUSE" } })).id;
  const cb = await db.category.create({ data: { businessId: b, name: "Hijab" } });
  const pb = await db.product.create({
    // SKU sama dengan bisnis pertama: boleh, karena SKU unik per bisnis.
    data: { businessId: b, name: "Pashmina", categoryId: cb.id, variants: { create: { businessId: b, sku: "PC-HTM", priceIdr: 50000 } } },
    include: { variants: true },
  });
  otherVariant = pb.variants[0].id;
  otherWallet = (await db.wallet.create({ data: { businessId: b, name: "Kas Lain", kind: "PERSON", ownerId: other.id, currency: "IDR" } })).id;
});

const qty = async (loc: number) => (await db.stock.findUnique({ where: { variantId_locationId: { variantId: hijab, locationId: loc } } }))?.qty ?? 0;

test("stok masuk lalu dipindah ke booth pameran", async () => {
  await receiveStock(db, owner, { locationId: gudang, lines: [{ variantId: hijab, qty: 100 }] });
  await transferStock(db, owner, { fromLocationId: gudang, toLocationId: kl, lines: [{ variantId: hijab, qty: 40 }] });
  assert.equal(await qty(gudang), 60);
  assert.equal(await qty(kl), 40);
  await assert.rejects(transferStock(db, owner, { fromLocationId: gudang, toLocationId: kl, lines: [{ variantId: hijab, qty: 999 }] }), BusinessError);
});

test("penjualan MYR di pameran: kurs dikunci, stok berkurang, uang masuk dompet Sari", async () => {
  const sale = await createSale(db, sari, {
    channel: "EVENT", eventId, locationId: kl, currency: "MYR", rateToIdr: 3500,
    items: [{ variantId: hijab, qty: 2, price: 4500 }], discount: 500,
    payments: [{ method: "CASH", amount: 8500, walletId: sariMyr }],
  });
  assert.equal(sale.total, 8500); // RM 85,00
  assert.equal(sale.totalIdr, 297500);
  assert.match(sale.number, /^NM-\d{8}-0001$/);
  assert.equal(await qty(kl), 38);
  const b = (await walletBalances(db, bId)).get(sariMyr)!;
  assert.equal(b.balance, 8500);
});

test("validasi penjualan", async () => {
  const base = { channel: "EVENT" as const, eventId, locationId: kl, currency: "MYR", rateToIdr: 3500, items: [{ variantId: hijab, qty: 1, price: 4500 }], discount: 0 };
  await assert.rejects(createSale(db, sari, { ...base, payments: [{ method: "CASH", amount: 4000, walletId: sariMyr }] }), /harus sama dengan total/);
  await assert.rejects(createSale(db, sari, { ...base, payments: [{ method: "CASH", amount: 4500, walletId: sariIdr }] }), /memakai IDR/);
  await assert.rejects(createSale(db, sari, { ...base, locationId: gudang, payments: [{ method: "CASH", amount: 4500, walletId: sariMyr }] }), /lokasi event/);
});

test("pengeluaran langsung mengurangi saldo; setoran menunggu konfirmasi", async () => {
  await createCashMove(db, sari, { type: "EXPENSE", fromWalletId: sariMyr, amount: 1500, eventId, category: "TRANSPORT" });
  let b = (await walletBalances(db, bId)).get(sariMyr)!;
  assert.equal(b.balance, 7000);

  const dep = await createCashMove(db, sari, { type: "DEPOSIT", fromWalletId: sariMyr, toWalletId: bca, amount: 6000, toAmount: 210000 });
  assert.equal(dep.status, "PENDING");
  b = (await walletBalances(db, bId)).get(sariMyr)!;
  assert.equal(b.balance, 7000);
  assert.equal(b.pendingOut, 6000);

  await assert.rejects(decideCashMove(db, sari, dep.id, true), BusinessError); // staf tidak bisa konfirmasi setorannya sendiri
  await decideCashMove(db, owner, dep.id, true);
  const all = await walletBalances(db, bId);
  assert.equal(all.get(sariMyr)!.balance, 1000); // sisa RM 10 dipegang Sari
  assert.equal(all.get(bca)!.balance, 210000); // diterima dalam rupiah sesuai kurs tukar asli
});

test("staf tidak bisa mencatat uang dari dompet orang lain", async () => {
  await assert.rejects(createCashMove(db, sari, { type: "EXPENSE", fromWalletId: bca, amount: 100 }), /dompet sendiri/);
});

test("batal jual mengembalikan stok dan uang", async () => {
  const sale = await createSale(db, sari, {
    channel: "EVENT", eventId, locationId: kl, currency: "MYR", rateToIdr: 3500,
    items: [{ variantId: hijab, qty: 1, price: 4500 }], discount: 0,
    payments: [{ method: "CASH", amount: 4500, walletId: sariMyr }],
  });
  assert.equal(await qty(kl), 37);
  await voidSale(db, owner, sale.id, "salah input");
  assert.equal(await qty(kl), 38);
  assert.equal((await walletBalances(db, bId)).get(sariMyr)!.balance, 1000);
});

test("stock opname dan pengembalian sisa stok pameran", async () => {
  await adjustStock(db, owner, { locationId: kl, variantId: hijab, countedQty: 37 });
  assert.equal(await qty(kl), 37);
  await returnAllStock(db, owner, kl, gudang);
  assert.equal(await qty(kl), 0);
  assert.equal(await qty(gudang), 97);
});

test("bisnis lain tidak bisa memakai atau mengubah data bisnis pertama", async () => {
  const sale = { channel: "OFFLINE" as const, currency: "IDR", rateToIdr: 1, discount: 0 };
  // Lokasi, barang, atau dompet milik bisnis lain ditolak.
  await assert.rejects(createSale(db, other, { ...sale, locationId: gudang, items: [{ variantId: otherVariant, qty: 1, price: 50000 }], payments: [{ method: "CASH", amount: 50000, walletId: otherWallet }] }), /Lokasi tidak ditemukan/);
  await assert.rejects(createSale(db, other, { ...sale, locationId: otherGudang, items: [{ variantId: hijab, qty: 1, price: 50000 }], payments: [{ method: "CASH", amount: 50000, walletId: otherWallet }] }), /Barang tidak ditemukan/);
  await assert.rejects(createSale(db, other, { ...sale, locationId: otherGudang, items: [{ variantId: otherVariant, qty: 1, price: 50000 }], payments: [{ method: "CASH", amount: 50000, walletId: bca }] }), /Dompet penerima tidak ditemukan/);
  await assert.rejects(createSale(db, other, { ...sale, channel: "EVENT", eventId, locationId: kl, items: [{ variantId: otherVariant, qty: 1, price: 50000 }], payments: [{ method: "CASH", amount: 50000, walletId: otherWallet }] }), /tidak ditemukan/);

  await assert.rejects(receiveStock(db, other, { locationId: gudang, lines: [{ variantId: hijab, qty: 5 }] }), BusinessError);
  await assert.rejects(transferStock(db, other, { fromLocationId: gudang, toLocationId: otherGudang, lines: [{ variantId: hijab, qty: 1 }] }), BusinessError);
  await assert.rejects(adjustStock(db, other, { locationId: gudang, variantId: hijab, countedQty: 0 }), BusinessError);
  await assert.rejects(returnAllStock(db, other, gudang, otherGudang), BusinessError);
  assert.equal(await qty(gudang), 97);

  await assert.rejects(createCashMove(db, other, { type: "DEPOSIT", fromWalletId: sariIdr, toWalletId: otherWallet, amount: 100 }), /tidak ditemukan/);
  await assert.rejects(createCashMove(db, other, { type: "DEPOSIT", fromWalletId: otherWallet, toWalletId: bca, amount: 100 }), /tidak ditemukan/);
  await assert.rejects(createCashMove(db, other, { type: "ADJUST", toWalletId: bca, amount: 100 }), /tidak ditemukan/);

  const pending = await createCashMove(db, sari, { type: "DEPOSIT", fromWalletId: sariMyr, toWalletId: bca, amount: 100, toAmount: 3500 });
  await assert.rejects(decideCashMove(db, other, pending.id, true), /tidak ditemukan/);
  const firstSale = await db.sale.findFirstOrThrow({ where: { businessId: bId, status: "PAID" } });
  await assert.rejects(voidSale(db, other, firstSale.id, "iseng"), /tidak ditemukan/);

  // Saldo dan nomor nota dihitung per bisnis.
  const own = await createSale(db, other, { ...sale, locationId: otherGudang, items: [{ variantId: otherVariant, qty: 1, price: 50000 }], payments: [{ method: "CASH", amount: 50000, walletId: otherWallet }] });
  assert.match(own.number, /-0001$/);
  assert.equal((await walletBalances(db, own.businessId)).get(otherWallet)!.balance, 50000);
  assert.equal((await walletBalances(db, bId)).has(otherWallet), false);
});

test("PIN disimpan sebagai hash dan diverifikasi", async () => {
  const { hashPin, verifyPin } = await import("../src/lib/auth");
  const h = hashPin("1234");
  assert.ok(!h.includes("1234"));
  assert.ok(verifyPin("1234", h));
  assert.ok(!verifyPin("4321", h));
  assert.ok(!verifyPin("1234", null));
});

test("nomor nota memakai tanggal Jakarta", async () => {
  const { jakartaDay } = await import("../src/lib/time");
  // 20 Nov 2026 pukul 20.00 UTC = 21 Nov 03.00 WIB
  assert.equal(jakartaDay(new Date("2026-11-20T20:00:00Z")), "2026-11-21");
});
