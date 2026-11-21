"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { SESSION_COOKIE, STORE_COOKIE, requireUser, requireAdmin, getCurrentUser } from "@/lib/session";
import { hashPin, verifyPin, newSessionToken, PIN_RULE, MAX_FAILED_LOGINS, LOCK_MINUTES, SESSION_DAYS } from "@/lib/auth";
import {
  BusinessError, createSale, voidSale, receiveStock, transferStock, adjustStock, returnAllStock,
  createCashMove, decideCashMove, type SaleInput, type CashMoveInput,
} from "@/lib/services";
import { toMinor } from "@/lib/money";
import { CURRENCIES } from "@/lib/constants";
import { formDate, startOfDay } from "@/lib/time";
import { RECEIPT_KEYS } from "@/lib/receipt";
import { normalizeSlug, slugProblem } from "@/lib/business";
import { businessBlockReason, createBusinessWithOwner, getPlatformSettings } from "@/lib/platform";

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

async function startSession(userId: number) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.session.create({ data: { token, userId, expiresAt } });
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

function loginError(msg: string, path = "/masuk"): never {
  redirect(path + "?error=" + encodeURIComponent(msg));
}

async function rememberStore(slug: string) {
  (await cookies()).set(STORE_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 864e2,
    path: "/",
  });
}

/** Langkah pertama masuk: pilih toko lewat kode toko. */
export async function chooseStore(fd: FormData) {
  const slug = normalizeSlug(text(fd, "store"));
  const business = slug ? await db.business.findUnique({ where: { slug } }) : null;
  if (!business) loginError("Kode toko tidak ditemukan. Cek lagi ejaannya, atau daftarkan bisnis baru.");
  const blocked = businessBlockReason(business);
  if (blocked) loginError(blocked);
  await rememberStore(business.slug);
  redirect("/masuk");
}

export async function forgetStore() {
  (await cookies()).delete(STORE_COOKIE);
  redirect("/masuk");
}

export async function login(fd: FormData) {
  const id = int(fd, "userId");
  const pin = text(fd, "pin");
  const slug = normalizeSlug(text(fd, "store"));
  const user = await db.user.findFirst({ where: { id, active: true, business: { slug, active: true, pending: false } } });
  if (!user) loginError("Pengguna tidak ditemukan.");
  if (user.lockedUntil && user.lockedUntil > new Date())
    loginError(`Terlalu banyak PIN salah. Coba lagi setelah ${user.lockedUntil.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB, atau minta admin mengganti PIN.`);
  if (!user.pinHash) loginError("Akun ini belum punya PIN. Minta admin mengatur PIN di menu Pengaturan.");
  if (!verifyPin(pin, user.pinHash)) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null },
    });
    loginError(lock ? `PIN salah ${MAX_FAILED_LOGINS} kali. Akun dikunci ${LOCK_MINUTES} menit.` : `PIN salah. Sisa percobaan: ${MAX_FAILED_LOGINS - failed}.`);
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await startSession(user.id);
  redirect(user.role === "STAFF" ? "/kasir" : "/");
}

export async function logout() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  store.delete(SESSION_COOKIE);
  redirect("/masuk");
}

/** Daftarkan bisnis baru beserta akun owner-nya. */
export async function registerBusiness(fd: FormData) {
  const err: (m: string) => never = (m) => loginError(m, "/daftar");
  const { mode, code } = await getPlatformSettings();
  if (mode === "CLOSED") err("Pendaftaran toko baru sedang ditutup. Hubungi admin.");
  if (mode === "INVITE" && (!code || text(fd, "signupCode") !== code)) err("Kode undangan salah.");
  const businessName = text(fd, "businessName").slice(0, 80);
  const slug = normalizeSlug(text(fd, "store"));
  const name = text(fd, "name");
  const pin = text(fd, "pin");
  if (!businessName) err("Nama bisnis wajib diisi.");
  const problem = slugProblem(slug);
  if (problem) err(problem);
  if (!name) err("Nama Anda wajib diisi.");
  if (!PIN_RULE.test(pin)) err("PIN harus 4 sampai 8 angka.");
  if (pin !== text(fd, "pin2")) err("Kedua PIN tidak sama.");
  if (await db.business.findUnique({ where: { slug } })) err(`Kode toko "${slug}" sudah dipakai. Pilih kode lain.`);

  const pending = mode === "APPROVAL";
  let owner;
  try {
    ({ owner } = await db.$transaction((tx) =>
      createBusinessWithOwner(tx, { businessName, slug, ownerName: name, pinHash: hashPin(pin), pending }),
    ));
  } catch (e) {
    console.error(e);
    err("Gagal mendaftar. Mungkin kode toko baru saja dipakai orang lain. Coba lagi.");
  }
  if (!owner) err("Gagal mendaftar. Coba lagi.");
  await rememberStore(slug);
  if (pending) {
    redirect(
      "/daftar?ok=" +
        encodeURIComponent(`Pendaftaran "${businessName}" diterima dengan kode toko ${slug}. Anda bisa masuk setelah disetujui admin.`),
    );
  }
  await startSession(owner.id);
  redirect(
    "/pengaturan?ok=" +
      encodeURIComponent(`Bisnis terdaftar. Kode toko Anda: ${slug}. Lanjutkan dengan mengisi kategori, kurs, tim, dan dompet.`),
  );
}

export async function changeMyPin(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/masuk");
  await attempt("/akun", "PIN diganti.", async () => {
    if (!verifyPin(text(fd, "oldPin"), user.pinHash)) throw new BusinessError("PIN lama salah.");
    const pin = text(fd, "pin");
    if (!PIN_RULE.test(pin)) throw new BusinessError("PIN baru harus 4 sampai 8 angka.");
    if (pin !== text(fd, "pin2")) throw new BusinessError("Kedua PIN baru tidak sama.");
    await db.user.update({ where: { id: user.id }, data: { pinHash: hashPin(pin) } });
  });
}

export async function resetPin(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "PIN diganti. Sesi login lama orang itu sudah diakhiri.", async () => {
    const id = int(fd, "id");
    const target = await db.user.findFirst({ where: { id, businessId: me.businessId } });
    if (!target) throw new BusinessError("Pengguna tidak ditemukan.");
    if (target.role === "OWNER" && me.role !== "OWNER") throw new BusinessError("Hanya owner yang bisa mengganti PIN owner.");
    const pin = text(fd, "pin");
    if (!PIN_RULE.test(pin)) throw new BusinessError("PIN harus 4 sampai 8 angka.");
    await db.user.update({ where: { id }, data: { pinHash: hashPin(pin), failedLogins: 0, lockedUntil: null } });
    if (id !== me.id) await db.session.deleteMany({ where: { userId: id } });
  });
}

// ---------- penjualan ----------

export async function saveSale(input: SaleInput): Promise<{ ok: true; id: number; number: string } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    const sale = await createSale(db, user, input);
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
  await attempt(`/penjualan/${id}`, "Penjualan dibatalkan, stok dikembalikan.", () => voidSale(db, user, id, text(fd, "reason")));
}

// ---------- produk ----------

async function ownCategory(businessId: number, id: number) {
  const c = await db.category.findFirst({ where: { id, businessId } });
  if (!c) throw new BusinessError("Pilih kategori.");
  return c;
}

export async function createProduct(fd: FormData) {
  const user = await requireAdmin();
  const bid = user.businessId;
  await attempt("/produk", "Produk ditambahkan.", async () => {
    const name = text(fd, "name");
    const base = text(fd, "skuBase").toUpperCase();
    if (!name || !base) throw new BusinessError("Nama, kategori, dan kode SKU wajib diisi.");
    const category = await ownCategory(bid, int(fd, "categoryId"));
    const priceIdr = money(fd, "priceIdr", "IDR")!;
    const myr = money(fd, "priceMyr", "MYR", false);
    const sgd = money(fd, "priceSgd", "SGD", false);
    const colors = text(fd, "colors").split(",").map((s) => s.trim()).filter(Boolean);
    const sizes = text(fd, "sizes").split(",").map((s) => s.trim()).filter(Boolean);
    const combos = (colors.length ? colors : [""]).flatMap((c) => (sizes.length ? sizes : [""]).map((s) => [c, s] as const));
    await db.$transaction(async (tx) => {
      const p = await tx.product.create({ data: { businessId: bid, name, categoryId: category.id } });
      for (const [color, size] of combos) {
        const sku = [base, color.toUpperCase().replace(/\s+/g, "").slice(0, 4), size.toUpperCase().replace(/\s+/g, "")].filter(Boolean).join("-");
        if (await tx.variant.findUnique({ where: { businessId_sku: { businessId: bid, sku } } }))
          throw new BusinessError(`SKU ${sku} sudah dipakai.`);
        await tx.variant.create({
          data: {
            businessId: bid,
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
  const user = await requireAdmin();
  const bid = user.businessId;
  const productId = int(fd, "productId");
  const id = int(fd, "id");
  await attempt(`/produk/${productId}`, "Varian disimpan.", async () => {
    if (!(await db.product.count({ where: { id: productId, businessId: bid } }))) throw new BusinessError("Produk tidak ditemukan.");
    if (id && !(await db.variant.count({ where: { id, productId, businessId: bid } }))) throw new BusinessError("Varian tidak ditemukan.");
    const sku = text(fd, "sku").toUpperCase();
    if (!sku) throw new BusinessError("SKU wajib diisi.");
    const dup = await db.variant.findUnique({ where: { businessId_sku: { businessId: bid, sku } } });
    if (dup && dup.id !== id) throw new BusinessError(`SKU ${sku} sudah dipakai.`);
    const data = {
      sku,
      color: text(fd, "color") || null,
      size: text(fd, "size") || null,
      priceIdr: money(fd, "priceIdr", "IDR")!,
      active: fd.get("active") === "on",
    };
    const v = id ? await db.variant.update({ where: { id }, data }) : await db.variant.create({ data: { ...data, businessId: bid, productId, active: true } });
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
  const user = await requireAdmin();
  const id = int(fd, "id");
  await attempt(`/produk/${id}`, "Produk disimpan.", async () => {
    const name = text(fd, "name");
    if (!name) throw new BusinessError("Nama wajib diisi.");
    if (!(await db.product.count({ where: { id, businessId: user.businessId } }))) throw new BusinessError("Produk tidak ditemukan.");
    const category = await ownCategory(user.businessId, int(fd, "categoryId"));
    await db.product.update({ where: { id }, data: { name, categoryId: category.id, active: fd.get("active") === "on" } });
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
    receiveStock(db, user, { locationId: int(fd, "locationId"), lines: lines(fd), note: text(fd, "note") || undefined }),
  );
}

export async function stockTransferAction(fd: FormData) {
  const user = await requireUser();
  await attempt(text(fd, "back") || "/stok", "Stok dipindahkan.", async () =>
    transferStock(db, user, {
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
    await adjustStock(db, user, {
      locationId: int(fd, "locationId"),
      variantId: int(fd, "variantId"),
      countedQty: Number(raw),
      note: text(fd, "note") || undefined,
    });
  });
}

// ---------- event ----------

export async function createEvent(fd: FormData) {
  const user = await requireAdmin();
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
        businessId: user.businessId,
        name, city: text(fd, "city") || null, country: text(fd, "country"), currency,
        startDate: startOfDay(start), endDate: startOfDay(end), notes: text(fd, "notes") || null,
        location: { create: { businessId: user.businessId, name: `Booth ${name}`, type: "EVENT" } },
      },
    });
  });
}

export async function returnEventStockAction(fd: FormData) {
  const user = await requireAdmin();
  const eventId = int(fd, "eventId");
  await attempt(`/event/${eventId}`, "Sisa stok dikembalikan.", async () => {
    const ev = await db.event.findFirst({ where: { id: eventId, businessId: user.businessId }, include: { location: true } });
    if (!ev?.location) throw new BusinessError("Event tidak punya lokasi stok.");
    await returnAllStock(db, user, ev.location.id, int(fd, "toLocationId"));
  });
}

// ---------- kas ----------

export async function cashMoveAction(fd: FormData) {
  const user = await requireUser();
  await attempt("/kas", "Tercatat.", async () => {
    const type = text(fd, "type") as CashMoveInput["type"];
    const fromWalletId = int(fd, "fromWalletId") || null;
    const toWalletId = int(fd, "toWalletId") || null;
    const bid = user.businessId;
    const from = fromWalletId ? await db.wallet.findFirst({ where: { id: fromWalletId, businessId: bid } }) : null;
    const to = toWalletId ? await db.wallet.findFirst({ where: { id: toWalletId, businessId: bid } }) : null;
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
      date: text(fd, "date") ? formDate(text(fd, "date")) : undefined,
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
    const pin = text(fd, "pin");
    if (!PIN_RULE.test(pin)) throw new BusinessError("PIN harus 4 sampai 8 angka.");
    if (!["OWNER", "ADMIN", "STAFF"].includes(role)) throw new BusinessError("Peran tidak valid.");
    const bid = me.businessId;
    const u = await db.user.create({ data: { businessId: bid, name, role, pinHash: hashPin(pin) } });
    const curs = CURRENCIES.filter((c) => fd.get(`wallet_${c}`) === "on");
    for (const c of curs)
      await db.wallet.create({
        data: { businessId: bid, name: `Kas ${name}${curs.length > 1 ? ` (${c})` : ""}`, kind: "PERSON", ownerId: u.id, currency: c },
      });
  });
}

export async function toggleUser(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "Status pengguna diubah.", async () => {
    const id = int(fd, "id");
    if (id === me.id) throw new BusinessError("Tidak bisa menonaktifkan diri sendiri.");
    const u = await db.user.findFirst({ where: { id, businessId: me.businessId } });
    if (!u) throw new BusinessError("Pengguna tidak ditemukan.");
    await db.user.update({ where: { id }, data: { active: !u.active } });
    if (u.active) await db.session.deleteMany({ where: { userId: id } });
  });
}

export async function createWallet(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "Dompet ditambahkan.", async () => {
    const name = text(fd, "name");
    if (!name) throw new BusinessError("Nama dompet wajib diisi.");
    const kind = text(fd, "kind");
    const ownerId = int(fd, "ownerId") || null;
    if (kind === "PERSON" && !ownerId) throw new BusinessError("Dompet orang harus punya pemegang.");
    if (kind === "PERSON" && !(await db.user.count({ where: { id: ownerId!, businessId: me.businessId } })))
      throw new BusinessError("Pemegang tidak ditemukan.");
    const currency = text(fd, "currency");
    if (!(CURRENCIES as readonly string[]).includes(currency)) throw new BusinessError("Mata uang tidak valid.");
    await db.wallet.create({
      data: { businessId: me.businessId, name, kind, ownerId: kind === "PERSON" ? ownerId : null, currency },
    });
  });
}

export async function toggleWallet(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "Status dompet diubah.", async () => {
    const w = await db.wallet.findFirst({ where: { id: int(fd, "id"), businessId: me.businessId } });
    if (!w) throw new BusinessError("Dompet tidak ditemukan.");
    await db.wallet.update({ where: { id: w.id }, data: { active: !w.active } });
  });
}

export async function addRate(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "Kurs disimpan.", async () => {
    const rate = Number(text(fd, "idrPerUnit").replace(/\./g, "").replace(",", "."));
    if (!(rate > 0)) throw new BusinessError("Kurs harus lebih dari 0.");
    const currency = text(fd, "currency");
    if (currency === "IDR" || !(CURRENCIES as readonly string[]).includes(currency)) throw new BusinessError("Mata uang tidak valid.");
    await db.exchangeRate.create({ data: { businessId: me.businessId, currency, idrPerUnit: rate } });
  });
}

export async function createLocation(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "Lokasi ditambahkan.", async () => {
    const name = text(fd, "name");
    if (!name) throw new BusinessError("Nama lokasi wajib diisi.");
    await db.location.create({ data: { businessId: me.businessId, name, type: text(fd, "type") } });
  });
}

export async function saveReceiptSettings(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "Pengaturan struk disimpan.", async () => {
    for (const k of RECEIPT_KEYS) {
      let value = text(fd, k).slice(0, 200);
      if (k === "paperWidth") value = value === "80" ? "80" : "58";
      const key = `receipt.${k}`;
      await db.setting.upsert({
        where: { businessId_key: { businessId: me.businessId, key } },
        create: { businessId: me.businessId, key, value },
        update: { value },
      });
    }
  });
}

// ---------- QR pembayaran ----------

const QR_TYPES = ["image/png", "image/jpeg", "image/webp"];
const QR_MAX_BYTES = 1024 * 1024;

export async function createPaymentQr(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "QR pembayaran ditambahkan.", async () => {
    const name = text(fd, "name");
    if (!name) throw new BusinessError("Nama QR wajib diisi.");
    const wallet = await db.wallet.findFirst({ where: { id: int(fd, "walletId"), businessId: me.businessId } });
    if (!wallet) throw new BusinessError("Pilih dompet/rekening penerima.");
    const file = fd.get("image");
    if (!(file instanceof File) || file.size === 0) throw new BusinessError("Pilih gambar QR.");
    if (!QR_TYPES.includes(file.type)) throw new BusinessError("Gambar harus PNG, JPG, atau WEBP.");
    if (file.size > QR_MAX_BYTES) throw new BusinessError("Ukuran gambar maksimal 1 MB. Potong gambar supaya hanya bagian QR-nya.");
    await db.paymentQr.create({
      data: {
        businessId: me.businessId,
        name,
        currency: wallet.currency,
        walletId: wallet.id,
        image: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
        note: text(fd, "note") || null,
      },
    });
  });
}

export async function togglePaymentQr(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "Status QR diubah.", async () => {
    const qr = await db.paymentQr.findFirst({
      where: { id: int(fd, "id"), businessId: me.businessId },
      select: { id: true, active: true },
    });
    if (!qr) throw new BusinessError("QR tidak ditemukan.");
    await db.paymentQr.update({ where: { id: qr.id }, data: { active: !qr.active } });
  });
}

export async function deletePaymentQr(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "QR dihapus.", async () => {
    const { count } = await db.paymentQr.deleteMany({ where: { id: int(fd, "id"), businessId: me.businessId } });
    if (!count) throw new BusinessError("QR tidak ditemukan.");
  });
}

// ---------- bisnis & kategori ----------

export async function saveBusiness(fd: FormData) {
  const me = await requireAdmin();
  await attempt("/pengaturan", "Nama bisnis disimpan.", async () => {
    if (me.role !== "OWNER") throw new BusinessError("Hanya owner yang bisa mengganti nama bisnis.");
    const name = text(fd, "name");
    if (!name) throw new BusinessError("Nama bisnis wajib diisi.");
    await db.business.update({ where: { id: me.businessId }, data: { name: name.slice(0, 80) } });
  });
}

export async function saveCategory(fd: FormData) {
  const me = await requireAdmin();
  const id = int(fd, "id");
  await attempt("/pengaturan", id ? "Kategori disimpan." : "Kategori ditambahkan.", async () => {
    const name = text(fd, "name").slice(0, 60);
    if (!name) throw new BusinessError("Nama kategori wajib diisi.");
    const dup = await db.category.findUnique({ where: { businessId_name: { businessId: me.businessId, name } } });
    if (dup && dup.id !== id) throw new BusinessError(`Kategori "${name}" sudah ada.`);
    if (id) {
      const { count } = await db.category.updateMany({
        where: { id, businessId: me.businessId },
        data: { name, active: fd.get("active") === "on" },
      });
      if (!count) throw new BusinessError("Kategori tidak ditemukan.");
    } else {
      await db.category.create({ data: { businessId: me.businessId, name } });
    }
  });
}
