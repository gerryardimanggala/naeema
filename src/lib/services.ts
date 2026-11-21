// Logika bisnis inti. Sengaja tidak bergantung pada Next.js supaya bisa diuji langsung.
import type { Prisma, PrismaClient } from "@prisma/client";
import { toIdr } from "./money";
import { jakartaDay } from "./time";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient;

export class BusinessError extends Error {}

// ---------- Stok ----------

async function changeStock(tx: Tx, variantId: number, locationId: number, delta: number) {
  await tx.stock.upsert({
    where: { variantId_locationId: { variantId, locationId } },
    create: { variantId, locationId, qty: delta },
    update: { qty: { increment: delta } },
  });
}

export async function receiveStock(
  db: Db,
  userId: number,
  input: { locationId: number; lines: { variantId: number; qty: number }[]; note?: string },
) {
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new BusinessError("Isi minimal satu barang dengan jumlah lebih dari 0.");
  await db.$transaction(async (tx) => {
    for (const l of lines) {
      await changeStock(tx, l.variantId, input.locationId, l.qty);
      await tx.stockMove.create({
        data: { type: "IN", variantId: l.variantId, toLocationId: input.locationId, qty: l.qty, note: input.note, userId },
      });
    }
  });
}

export async function transferStock(
  db: Db,
  userId: number,
  input: { fromLocationId: number; toLocationId: number; lines: { variantId: number; qty: number }[]; note?: string },
) {
  if (input.fromLocationId === input.toLocationId) throw new BusinessError("Lokasi asal dan tujuan tidak boleh sama.");
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new BusinessError("Isi minimal satu barang dengan jumlah lebih dari 0.");
  await db.$transaction(async (tx) => {
    for (const l of lines) {
      const s = await tx.stock.findUnique({
        where: { variantId_locationId: { variantId: l.variantId, locationId: input.fromLocationId } },
        include: { variant: true },
      });
      if (!s || s.qty < l.qty) {
        const v = s?.variant ?? (await tx.variant.findUnique({ where: { id: l.variantId } }));
        throw new BusinessError(`Stok ${v?.sku ?? l.variantId} di lokasi asal hanya ${s?.qty ?? 0}.`);
      }
      await changeStock(tx, l.variantId, input.fromLocationId, -l.qty);
      await changeStock(tx, l.variantId, input.toLocationId, l.qty);
      await tx.stockMove.create({
        data: {
          type: "TRANSFER",
          variantId: l.variantId,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          qty: l.qty,
          note: input.note,
          userId,
        },
      });
    }
  });
}

/** Stock opname: set jumlah fisik, sistem mencatat selisihnya. */
export async function adjustStock(
  db: Db,
  userId: number,
  input: { locationId: number; variantId: number; countedQty: number; note?: string },
) {
  if (input.countedQty < 0) throw new BusinessError("Jumlah fisik tidak boleh negatif.");
  await db.$transaction(async (tx) => {
    const s = await tx.stock.findUnique({
      where: { variantId_locationId: { variantId: input.variantId, locationId: input.locationId } },
    });
    const delta = input.countedQty - (s?.qty ?? 0);
    if (delta === 0) return;
    await changeStock(tx, input.variantId, input.locationId, delta);
    await tx.stockMove.create({
      data: {
        type: "ADJUST",
        variantId: input.variantId,
        toLocationId: delta > 0 ? input.locationId : null,
        fromLocationId: delta < 0 ? input.locationId : null,
        qty: Math.abs(delta),
        note: input.note,
        userId,
      },
    });
  });
}

/** Kembalikan seluruh sisa stok sebuah lokasi (mis. pameran) ke lokasi lain. */
export async function returnAllStock(db: Db, userId: number, fromLocationId: number, toLocationId: number) {
  const stocks = await db.stock.findMany({ where: { locationId: fromLocationId, qty: { gt: 0 } } });
  if (!stocks.length) throw new BusinessError("Tidak ada sisa stok di lokasi ini.");
  await transferStock(db, userId, {
    fromLocationId,
    toLocationId,
    lines: stocks.map((s) => ({ variantId: s.variantId, qty: s.qty })),
    note: "Pengembalian sisa stok",
  });
}

// ---------- Penjualan ----------

export type SaleInput = {
  channel: "OFFLINE" | "MARKETPLACE" | "EVENT";
  marketplace?: string | null;
  externalRef?: string | null;
  eventId?: number | null;
  locationId: number;
  currency: string;
  rateToIdr: number;
  items: { variantId: number; qty: number; price: number }[];
  discount: number;
  payments: { method: string; amount: number; walletId: number }[];
  note?: string | null;
  date?: Date;
};

async function nextSaleNumber(tx: Tx, date: Date) {
  const ymd = jakartaDay(date).replace(/-/g, "");
  const prefix = `NM-${ymd}-`;
  const last = await tx.sale.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(4, "0");
}

export async function createSale(db: Db, cashierId: number, input: SaleInput) {
  const items = input.items.filter((i) => i.qty > 0);
  if (!items.length) throw new BusinessError("Keranjang masih kosong.");
  if (items.some((i) => !Number.isInteger(i.price) || i.price < 0)) throw new BusinessError("Harga tidak valid.");
  if (!(input.rateToIdr > 0)) throw new BusinessError("Kurs ke IDR harus diisi.");
  if (input.currency === "IDR" && input.rateToIdr !== 1) throw new BusinessError("Kurs IDR harus 1.");
  if (input.channel === "MARKETPLACE" && !input.marketplace) throw new BusinessError("Pilih marketplace-nya.");
  if (input.channel === "EVENT" && !input.eventId) throw new BusinessError("Pilih pameran / event-nya.");

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const discount = Math.max(0, input.discount || 0);
  if (discount > subtotal) throw new BusinessError("Diskon melebihi subtotal.");
  const total = subtotal - discount;

  const payments = input.payments.filter((p) => p.amount > 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  if (paid !== total) throw new BusinessError("Jumlah pembayaran harus sama dengan total.");

  return db.$transaction(async (tx) => {
    if (input.eventId) {
      const ev = await tx.event.findUnique({ where: { id: input.eventId }, include: { location: true } });
      if (!ev) throw new BusinessError("Event tidak ditemukan.");
      if (ev.location && ev.location.id !== input.locationId)
        throw new BusinessError("Penjualan event harus mengambil stok dari lokasi event tersebut.");
    }
    for (const p of payments) {
      const w = await tx.wallet.findUnique({ where: { id: p.walletId } });
      if (!w || !w.active) throw new BusinessError("Dompet penerima tidak ditemukan.");
      if (w.currency !== input.currency)
        throw new BusinessError(`Dompet "${w.name}" memakai ${w.currency}, sedangkan penjualan dalam ${input.currency}.`);
    }

    const date = input.date ?? new Date();
    const sale = await tx.sale.create({
      data: {
        number: await nextSaleNumber(tx, date),
        date,
        channel: input.channel,
        marketplace: input.channel === "MARKETPLACE" ? input.marketplace : null,
        externalRef: input.externalRef || null,
        eventId: input.eventId || null,
        locationId: input.locationId,
        cashierId,
        currency: input.currency,
        rateToIdr: input.rateToIdr,
        subtotal,
        discount,
        total,
        totalIdr: toIdr(total, input.currency, input.rateToIdr),
        note: input.note || null,
        items: { create: items.map((i) => ({ variantId: i.variantId, qty: i.qty, price: i.price })) },
        payments: { create: payments.map((p) => ({ method: p.method, amount: p.amount, walletId: p.walletId })) },
      },
    });
    for (const i of items) {
      // Stok boleh minus: penjualan di booth tidak boleh terhambat data stok yang belum rapi.
      // Stok minus ditandai di halaman stok supaya dicek.
      await changeStock(tx, i.variantId, input.locationId, -i.qty);
      await tx.stockMove.create({
        data: { type: "SALE", variantId: i.variantId, fromLocationId: input.locationId, qty: i.qty, saleId: sale.id, userId: cashierId },
      });
    }
    return sale;
  });
}

export async function voidSale(db: Db, userId: number, saleId: number, reason: string) {
  if (!reason.trim()) throw new BusinessError("Alasan pembatalan wajib diisi.");
  await db.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
    if (!sale) throw new BusinessError("Penjualan tidak ditemukan.");
    if (sale.status === "VOID") throw new BusinessError("Penjualan ini sudah dibatalkan.");
    await tx.sale.update({ where: { id: saleId }, data: { status: "VOID", voidReason: reason } });
    for (const i of sale.items) {
      await changeStock(tx, i.variantId, sale.locationId, i.qty);
      await tx.stockMove.create({
        data: { type: "VOID", variantId: i.variantId, toLocationId: sale.locationId, qty: i.qty, saleId, userId, note: reason },
      });
    }
  });
}

// ---------- Kas ----------

export type CashMoveInput = {
  type: "DEPOSIT" | "EXPENSE" | "EXCHANGE" | "TRANSFER" | "ADJUST";
  fromWalletId?: number | null;
  toWalletId?: number | null;
  amount: number;
  toAmount?: number | null;
  eventId?: number | null;
  category?: string | null;
  note?: string | null;
  date?: Date;
};

export async function createCashMove(db: Db, user: { id: number; role: string }, input: CashMoveInput) {
  const isAdmin = user.role !== "STAFF";
  const from = input.fromWalletId ? await db.wallet.findUnique({ where: { id: input.fromWalletId } }) : null;
  const to = input.toWalletId ? await db.wallet.findUnique({ where: { id: input.toWalletId } }) : null;

  if (input.type === "ADJUST") {
    if (!isAdmin) throw new BusinessError("Hanya admin yang bisa mengoreksi saldo.");
    if (!to || from) throw new BusinessError("Koreksi saldo hanya untuk satu dompet.");
    if (!input.amount) throw new BusinessError("Jumlah koreksi tidak boleh 0.");
  } else {
    if (!(input.amount > 0)) throw new BusinessError("Jumlah harus lebih dari 0.");
    if (!from) throw new BusinessError("Pilih dompet asal.");
    if (!isAdmin && from.ownerId !== user.id) throw new BusinessError("Anda hanya bisa mencatat uang dari dompet sendiri.");
  }

  if (input.type === "EXPENSE") {
    if (to) throw new BusinessError("Pengeluaran tidak punya dompet tujuan.");
  } else if (input.type !== "ADJUST") {
    if (!to) throw new BusinessError("Pilih dompet tujuan.");
    if (from!.id === to.id) throw new BusinessError("Dompet asal dan tujuan tidak boleh sama.");
    if (from!.currency !== to.currency && !(input.toAmount && input.toAmount > 0))
      throw new BusinessError(`Isi jumlah yang diterima dalam ${to.currency}.`);
    if (input.type === "EXCHANGE" && from!.currency === to.currency)
      throw new BusinessError("Tukar valas harus antar mata uang berbeda.");
  }

  // Pengeluaran, tukar valas antar dompet sendiri, dan koreksi admin langsung berlaku.
  // Setoran dan pindah dompet menunggu konfirmasi penerima.
  const sameOwner = from && to && from.ownerId && from.ownerId === to.ownerId;
  const autoConfirm = input.type === "EXPENSE" || input.type === "ADJUST" || (input.type === "EXCHANGE" && sameOwner);

  return db.cashMove.create({
    data: {
      type: input.type,
      fromWalletId: from?.id ?? null,
      toWalletId: to?.id ?? null,
      amount: input.amount,
      toAmount: from && to && from.currency !== to.currency ? input.toAmount : null,
      eventId: input.eventId || null,
      category: input.category || null,
      note: input.note || null,
      date: input.date ?? new Date(),
      createdById: user.id,
      status: autoConfirm ? "CONFIRMED" : "PENDING",
      confirmedById: autoConfirm ? user.id : null,
      confirmedAt: autoConfirm ? new Date() : null,
    },
  });
}

export async function decideCashMove(db: Db, user: { id: number; role: string }, id: number, approve: boolean) {
  const move = await db.cashMove.findUnique({ where: { id }, include: { toWallet: true } });
  if (!move) throw new BusinessError("Data tidak ditemukan.");
  if (move.status !== "PENDING") throw new BusinessError("Data ini sudah diproses.");
  const isReceiver = move.toWallet?.ownerId === user.id;
  if (user.role === "STAFF" && !isReceiver) throw new BusinessError("Hanya admin atau penerima yang bisa konfirmasi.");
  if (move.createdById === user.id && user.role !== "OWNER")
    throw new BusinessError("Setoran harus dikonfirmasi oleh orang lain, bukan pengirimnya.");
  await db.cashMove.update({
    where: { id },
    data: { status: approve ? "CONFIRMED" : "REJECTED", confirmedById: user.id, confirmedAt: new Date() },
  });
}

export type WalletBalance = {
  walletId: number;
  received: number; // dari penjualan
  moneyIn: number; // mutasi masuk terkonfirmasi
  moneyOut: number; // mutasi keluar terkonfirmasi
  pendingOut: number; // setoran yang belum dikonfirmasi
  balance: number;
};

export async function walletBalances(db: Db, until?: Date): Promise<Map<number, WalletBalance>> {
  const dateFilter = until ? { lte: until } : undefined;
  const [payments, ins, outs, pending] = await Promise.all([
    db.payment.groupBy({ by: ["walletId"], _sum: { amount: true }, where: { sale: { status: "PAID", date: dateFilter } } }),
    db.cashMove.findMany({ where: { status: "CONFIRMED", toWalletId: { not: null }, date: dateFilter }, select: { toWalletId: true, amount: true, toAmount: true } }),
    db.cashMove.groupBy({ by: ["fromWalletId"], _sum: { amount: true }, where: { status: "CONFIRMED", fromWalletId: { not: null }, date: dateFilter } }),
    db.cashMove.groupBy({ by: ["fromWalletId"], _sum: { amount: true }, where: { status: "PENDING", fromWalletId: { not: null }, date: dateFilter } }),
  ]);
  const map = new Map<number, WalletBalance>();
  const get = (id: number) => {
    let b = map.get(id);
    if (!b) map.set(id, (b = { walletId: id, received: 0, moneyIn: 0, moneyOut: 0, pendingOut: 0, balance: 0 }));
    return b;
  };
  for (const p of payments) get(p.walletId).received += p._sum.amount ?? 0;
  for (const m of ins) get(m.toWalletId!).moneyIn += m.toAmount ?? m.amount;
  for (const o of outs) get(o.fromWalletId!).moneyOut += o._sum.amount ?? 0;
  for (const p of pending) get(p.fromWalletId!).pendingOut += p._sum.amount ?? 0;
  for (const b of map.values()) b.balance = b.received + b.moneyIn - b.moneyOut;
  return map;
}

export async function latestRate(db: Db, currency: string) {
  if (currency === "IDR") return 1;
  const r = await db.exchangeRate.findFirst({ where: { currency }, orderBy: { date: "desc" } });
  return r?.idrPerUnit ?? 0;
}
