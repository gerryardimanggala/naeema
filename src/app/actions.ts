"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { USER_COOKIE, requireUser, requireAdmin } from "@/lib/session";
import {
  BusinessError, createSale, voidSale, receiveStock, transferStock, adjustStock, returnAllStock,
  createCashMove, decideCashMove, type SaleInput, type CashMoveInput,
} from "@/lib/services";
import { toMinor } from "@/lib/money";
import { CURRENCIES } from "@/lib/constants";

// ---------- helpers ----------

function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function int(fd: FormData, key: string) {
  const v = Number(text(fd, key));
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}
function money(fd: FormData, key: string, currency: string, required = true) {
  const raw = text(fd, key);
  if (!raw) {
    if (required) throw new BusinessError("Jumlah wajib diisi.");
    return null;
  }
  const v = toMinor(raw, currency);
  if (!Number.isFinite(v)) throw new BusinessError(`Angka "${raw}" tidak valid.`);
  return v;
}
function back(path: string, params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  return `${path}${path.includes("?") ? "&" : "?"}${q}`;
}

async function attempt(path: string, okMsg: string, fn: () => Promise<unknown>) {
  let error: string | null = null;
  try {
    await fn();
  } catch (e) {
    if (e instanceof BusinessError) error = e.message;
    else {
      console.error(e);
      error = "Terjadi kesalahan. Coba lagi atau hubungi admin.";
    }
  }
  revalidatePath("/", "layout");
  redirect(back(path, error ? { error } : { ok: okMsg }));
}

// ---------- sesi ----------

export async function login(fd: FormData) {
  const id = int(fd, "userId");
  const user = await db.user.findFirst({ where: { id, active: true } });
  if (!user) redirect("/masuk?error=" + encodeURIComponent("Pengguna tidak ditemukan."));
  (await cookies()).set(USER_COOKIE, String(user.id), { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
  redirect(user.role === "STAFF" ? "/kasir" : "/");
}

export async function logout() {
  (await cookies()).delete(USER_COOKIE);
  redirect("/masuk");
}

// ---------- penjualan ----------

export async function saveSale(input: SaleInput): Promise<{ ok: true; id: number; number: string } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    const sale = await createSale(db, user.id, input);
    revalidatePath("/", "layout");
    return { ok: true, id: sale.id, number: sale.number };
  } catch (e) {
    if (e instanceof BusinessError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Gagal menyimpan penjualan. Coba lagi." };
  }
}

export async function voidSaleAction(fd: FormData) {
  const user = await requireAdmin();
  const id = int(fd, "id");
  await attempt(`/penjualan/${id}`, "Penjualan dibatalkan, stok dikembalikan.", () => voidSale(db, user.id, id, text(fd, "reason")));
}

// ---------- produk ----------

export async function createProduct(fd: FormData) {
  await requireAdmin();
  await attempt("/produk", "Produk ditambahkan.", async () => {
    const name = text(fd, "name");
    const category = text(fd, "category");
    const base = text(fd, "skuBase").toUpperCase();
    if (!name || !category || !base) throw new BusinessError("Nama, kategori, dan kode SKU wajib diisi.");
    const priceIdr = money(fd, "priceIdr", "IDR")!;
    const myr = money(fd, "priceMyr", "MYR", false);
    const sgd = money(fd, "priceSgd", "SGD", false);
    const colors = text(fd, "colors").split(",").map((s) => s.trim()).filter(Boolean);
    const sizes = text(fd, "sizes").split(",").map((s) => s.trim()).filter(Boolean);
    const combos = (colors.length ? colors : [""]).flatMap((c) => (sizes.length ? sizes : [""]).map((s) => [c, s] as const));
    await db.$transaction(async (tx) => {
      const p = await tx.product.create({ data: { name, category } });
      for (const [color, size] of combos) {
        const sku = [base, color.toUpperCase().replace(/\s+/g, "").slice(0, 4), size.toUpperCase().replace(/\s+/g, "")].filter(Boolean).join("-");
        if (await tx.variant.findUnique({ where: { sku } })) throw new BusinessError(`SKU ${sku} sudah dipakai.`);
        await tx.variant.create({
          data: {
            productId: p.id, sku, color: color || null, size: size || null, priceIdr,
            prices: {
              create: [
                ...(myr ? [{ currency: "MYR", price: myr }] : []),
                ...(sgd ? [{ currency: "SGD", price: sgd }] : []),
              ],
            },
          },
        });
      }
    });
  });
}

export async function saveVariant(fd: FormData) {
  await requireAdmin();
  const productId = int(fd, "productId");
  const id = int(fd, "id");
  await attempt(`/produk/${productId}`, "Varian disimpan.", async () => {
    const sku = text(fd, "sku").toUpperCase();
    if (!sku) throw new BusinessError("SKU wajib diisi.");
    const dup = await db.variant.findUnique({ where: { sku } });
    if (dup && dup.id !== id) throw new BusinessError(`SKU ${sku} sudah dipakai.`);
    const data = {
      sku,
      color: text(fd, "color") || null,
      size: text(fd, "size") || null,
      priceIdr: money(fd, "priceIdr", "IDR")!,
      active: fd.get("active") === "on",
    };
    const v = id ? await db.variant.update({ where: { id }, data }) : await db.variant.create({ data: { ...data, productId, active: true } });
    for (const cur of ["MYR", "SGD"]) {
      const price = money(fd, `price${cur}`, cur, false);
      if (price) {
        await db.variantPrice.upsert({
          where: { variantId_currency: { variantId: v.id, currency: cur } },
          create: { variantId: v.id, currency: cur, price },
          update: { price },
        });
      } else {
        await db.variantPrice.deleteMany({ where: { variantId: v.id, currency: cur } });
      }
    }
  });
}

export async function saveProduct(fd: FormData) {
  await requireAdmin();
  const id = int(fd, "id");
  await attempt(`/produk/${id}`, "Produk disimpan.", async () => {
    const name = text(fd, "name");
    if (!name) throw new BusinessError("Nama wajib diisi.");
    await db.product.update({ where: { id }, data: { name, category: text(fd, "category"), active: fd.get("active") === "on" } });
  });
}

// ---------- stok ----------

function lines(fd: FormData) {
  const out: { variantId: number; qty: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("qty_") && typeof v === "string" && v.trim()) {
      const qty = Number(v);
      if (!Number.isInteger(qty) || qty < 0) throw new BusinessError("Jumlah harus bilangan bulat positif.");
      out.push({ variantId: Number(k.slice(4)), qty });
    }
  }
  return out;
}

export async function stockInAction(fd: FormData) {
  const user = await requireAdmin();
  await attempt("/stok", "Barang masuk dicatat.", async () =>
    receiveStock(db, user.id, { locationId: int(fd, "locationId"), lines: lines(fd), note: text(fd, "note") || undefined }),
  );
}

export async function stockTransferAction(fd: FormData) {
  const user = await requireUser();
  await attempt(text(fd, "back") || "/stok", "Stok dipindahkan.", async () =>
    transferStock(db, user.id, {
      fromLocationId: int(fd, "fromLocationId"),
      toLocationId: int(fd, "toLocationId"),
      lines: lines(fd),
      note: text(fd, "note") || undefined,
    }),
  );
}

export async function stockAdjustAction(fd: FormData) {
  const user = await requireAdmin();
  await attempt("/stok", "Stok dikoreksi.", async () => {
    const raw = text(fd, "countedQty");
    if (raw === "") throw new BusinessError("Isi jumlah fisik.");
    await adjustStock(db, user.id, {
      locationId: int(fd, "locationId"),
      variantId: int(fd, "variantId"),
      countedQty: Number(raw),
      note: text(fd, "note") || undefined,
    });
  });
}

// ---------- event ----------

export async function createEvent(fd: FormData) {
  await requireAdmin();
  await attempt("/event", "Event dibuat. Lokasi stok untuk booth juga sudah dibuat.", async () => {
    const name = text(fd, "name");
    const start = text(fd, "startDate");
    const end = text(fd, "endDate");
    const currency = text(fd, "currency");
    if (!name || !start || !end) throw new BusinessError("Nama dan tanggal event wajib diisi.");
    if (end < start) throw new BusinessError("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    if (!(CURRENCIES as readonly string[]).includes(currency)) throw new BusinessError("Mata uang tidak valid.");
    await db.event.create({
      data: {
        name, city: text(fd, "city") || null, country: text(fd, "country"), currency,
        startDate: new Date(start), endDate: new Date(end), notes: text(fd, "notes") || null,
        location: { create: { name: `Booth ${name}`, type: "EVENT" } },
      },
    });
  });
}

export async function returnEventStockAction(fd: FormData) {
  const user = await requireAdmin();
  const eventId = int(fd, "eventId");
  await attempt(`/event/${eventId}`, "Sisa stok dikembalikan.", async () => {
    const ev = await db.event.findUnique({ where: { id: eventId }, include: { location: true } });
    if (!ev?.location) throw new BusinessError("Event tidak punya lokasi stok.");
    await returnAllStock(db, user.id, ev.location.id, int(fd, "toLocationId"));
  });
}

// ---------- kas ----------

export async function cashMoveAction(fd: FormData) {
  const user = await requireUser();
  await attempt("/kas", "Tercatat.", async () => {
    const type = text(fd, "type") as CashMoveInput["type"];
    const fromWalletId = int(fd, "fromWalletId") || null;
    const toWalletId = int(fd, "toWalletId") || null;
    const from = fromWalletId ? await db.wallet.findUnique({ where: { id: fromWalletId } }) : null;
    const to = toWalletId ? await db.wallet.findUnique({ where: { id: toWalletId } }) : null;
    const mainCur = (from ?? to)?.currency;
    if (!mainCur) throw new BusinessError("Pilih dompet.");
    await createCashMove(db, user, {
      type,
      fromWalletId: type === "ADJUST" ? null : fromWalletId,
      toWalletId: type === "EXPENSE" ? null : type === "ADJUST" ? fromWalletId ?? toWalletId : toWalletId,
      amount: money(fd, "amount", mainCur)!,
      toAmount: to && from && to.currency !== from.currency ? money(fd, "toAmount", to.currency, false) : null,
      eventId: int(fd, "eventId") || null,
      category: text(fd, "category") || null,
      note: text(fd, "note") || null,
      date: text(fd, "date") ? new Date(text(fd, "date")) : undefined,
    });
  });
}

export async function decideCashMoveAction(fd: FormData) {
  const user = await requireUser();
  const approve = text(fd, "decision") === "approve";
  await attempt("/kas", approve ? "Setoran dikonfirmasi." : "Setoran ditolak.", () => decideCashMove(db, user, int(fd, "id"), approve));
}

// ---------- pengaturan ----------

export async function createUser(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "Pengguna ditambahkan.", async () => {
    const name = text(fd, "name");
    const role = text(fd, "role");
    if (!name) throw new BusinessError("Nama wajib diisi.");
    if (role === "OWNER" && me.role !== "OWNER") throw new BusinessError("Hanya owner yang bisa menambah owner.");
    const u = await db.user.create({ data: { name, role } });
    const curs = CURRENCIES.filter((c) => fd.get(`wallet_${c}`) === "on");
    for (const c of curs) await db.wallet.create({ data: { name: `Kas ${name}${curs.length > 1 ? ` (${c})` : ""}`, kind: "PERSON", ownerId: u.id, currency: c } });
  });
}

export async function toggleUser(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "Status pengguna diubah.", async () => {
    const id = int(fd, "id");
    if (id === me.id) throw new BusinessError("Tidak bisa menonaktifkan diri sendiri.");
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    await db.user.update({ where: { id }, data: { active: !u.active } });
  });
}

export async function createWallet(fd: FormData) {
  await requireAdmin();
  await attempt("/pengaturan", "Dompet ditambahkan.", async () => {
    const name = text(fd, "name");
    if (!name) throw new BusinessError("Nama dompet wajib diisi.");
    const kind = text(fd, "kind");
    const ownerId = int(fd, "ownerId") || null;
    if (kind === "PERSON" && !ownerId) throw new BusinessError("Dompet orang harus punya pemegang.");
    await db.wallet.create({ data: { name, kind, ownerId: kind === "PERSON" ? ownerId : null, currency: text(fd, "currency") } });
  });
}

export async function toggleWallet(fd: FormData) {
  await requireAdmin();
  await attempt("/pengaturan", "Status dompet diubah.", async () => {
    const w = await db.wallet.findUniqueOrThrow({ where: { id: int(fd, "id") } });
    await db.wallet.update({ where: { id: w.id }, data: { active: !w.active } });
  });
}

export async function addRate(fd: FormData) {
  await requireAdmin();
  await attempt("/pengaturan", "Kurs disimpan.", async () => {
    const rate = Number(text(fd, "idrPerUnit").replace(/\./g, "").replace(",", "."));
    if (!(rate > 0)) throw new BusinessError("Kurs harus lebih dari 0.");
    await db.exchangeRate.create({ data: { currency: text(fd, "currency"), idrPerUnit: rate } });
  });
}

export async function createLocation(fd: FormData) {
  await requireAdmin();
  await attempt("/pengaturan", "Lokasi ditambahkan.", async () => {
    const name = text(fd, "name");
    if (!name) throw new BusinessError("Nama lokasi wajib diisi.");
    await db.location.create({ data: { name, type: text(fd, "type") } });
  });
}
