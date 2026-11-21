"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { saveSale } from "../actions";
import { CHANNELS, CURRENCIES, MARKETPLACES, PAYMENT_METHODS } from "@/lib/constants";
import { formatMoney, fromMinor, toMinor, decimals } from "@/lib/money";

type Variant = { id: number; sku: string; name: string; detail: string; priceIdr: number; prices: Record<string, number>; stock: Record<string, number> };
type Wallet = { id: number; name: string; kind: string; currency: string; ownerId: number | null };
type Ev = { id: number; name: string; currency: string; locationId: number; dates: string };
type Line = { variantId: number; qty: number; price: number; converted: boolean };
type Pay = { method: string; amount: string; walletId: number };

const STORAGE_KEY = "naeema-kasir-pref";

export default function KasirForm(props: {
  userId: number;
  rates: Record<string, number>;
  locations: { id: number; name: string; type: string }[];
  events: Ev[];
  variants: Variant[];
  wallets: Wallet[];
}) {
  const { userId, rates, locations, events, variants, wallets } = props;
  const [channel, setChannel] = useState<"OFFLINE" | "MARKETPLACE" | "EVENT">("OFFLINE");
  const [marketplace, setMarketplace] = useState("SHOPEE");
  const [externalRef, setExternalRef] = useState("");
  const [eventId, setEventId] = useState<number | null>(events[0]?.id ?? null);
  const [locationId, setLocationId] = useState<number>(locations.find((l) => l.type === "STORE")?.id ?? locations[0]?.id);
  const [currency, setCurrency] = useState("IDR");
  const [rate, setRate] = useState("1");
  const [cart, setCart] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [payments, setPayments] = useState<Pay[]>([]);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string; id?: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const event = events.find((e) => e.id === eventId) ?? null;
  const effectiveLocation = channel === "EVENT" ? event?.locationId ?? null : locationId;

  // Ingat pilihan terakhir (berguna saat jaga booth seharian).
  useEffect(() => {
    try {
      const pref = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (pref?.channel) applyChannel(pref.channel, pref.eventId, pref.locationId);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ channel, eventId, locationId }));
    } catch {}
  }, [channel, eventId, locationId]);

  function priceFor(v: Variant, cur: string, r: number) {
    if (cur === "IDR") return { price: v.priceIdr, converted: false };
    if (v.prices[cur] != null) return { price: v.prices[cur], converted: false };
    return { price: r > 0 ? toMinor((v.priceIdr / r).toFixed(decimals(cur)), cur) : 0, converted: true };
  }

  function applyCurrency(cur: string) {
    const r = cur === "IDR" ? 1 : rates[cur] ?? 0;
    setCurrency(cur);
    setRate(String(r));
    setCart((c) => c.map((l) => ({ ...l, ...priceFor(variants.find((v) => v.id === l.variantId)!, cur, r) })));
    setPayments([]);
  }

  function applyChannel(ch: typeof channel, evId?: number | null, locId?: number) {
    setChannel(ch);
    if (ch === "EVENT") {
      const ev = events.find((e) => e.id === (evId ?? eventId)) ?? events[0];
      if (ev) {
        setEventId(ev.id);
        applyCurrency(ev.currency);
      }
    } else {
      if (locId && locations.some((l) => l.id === locId)) setLocationId(locId);
      else setLocationId((ch === "MARKETPLACE" ? locations.find((l) => l.type === "WAREHOUSE") : locations.find((l) => l.type === "STORE"))?.id ?? locations[0]?.id);
      applyCurrency("IDR");
    }
  }

  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const discountMinor = discount ? toMinor(discount, currency) || 0 : 0;
  const total = Math.max(0, subtotal - discountMinor);
  const curWallets = wallets.filter((w) => w.currency === currency);

  function defaultWallet(method: string) {
    if (method === "CASH") return curWallets.find((w) => w.ownerId === userId) ?? curWallets.find((w) => w.kind === "PERSON") ?? curWallets[0];
    if (method === "MARKETPLACE") {
      const name = MARKETPLACES[marketplace]?.toLowerCase() ?? "";
      return curWallets.find((w) => w.kind === "MARKETPLACE" && w.name.toLowerCase().includes(name)) ?? curWallets.find((w) => w.kind === "MARKETPLACE") ?? curWallets[0];
    }
    return curWallets.find((w) => w.kind === "BANK") ?? curWallets[0];
  }

  // Satu baris pembayaran default yang otomatis mengikuti total.
  const effectivePayments: Pay[] = useMemo(() => {
    if (payments.length) return payments;
    const method = channel === "MARKETPLACE" ? "MARKETPLACE" : "CASH";
    const w = defaultWallet(method);
    return w ? [{ method, amount: String(fromMinor(total, currency)), walletId: w.id }] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, total, currency, channel, marketplace]);
  const paid = effectivePayments.reduce((s, p) => s + (toMinor(p.amount || "0", currency) || 0), 0);

  function addVariant(v: Variant) {
    setCart((c) => {
      const ex = c.find((l) => l.variantId === v.id);
      if (ex) return c.map((l) => (l.variantId === v.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { variantId: v.id, qty: 1, ...priceFor(v, currency, Number(rate)) }];
    });
    setResult(null);
  }

  const filtered = variants.filter((v) => {
    const q = search.trim().toLowerCase();
    return !q || `${v.sku} ${v.name} ${v.detail}`.toLowerCase().includes(q);
  });

  function submit() {
    setResult(null);
    startTransition(async () => {
      const res = await saveSale({
        channel,
        marketplace: channel === "MARKETPLACE" ? marketplace : null,
        externalRef: externalRef || null,
        eventId: channel === "EVENT" ? eventId : null,
        locationId: effectiveLocation!,
        currency,
        rateToIdr: Number(rate),
        items: cart.map((l) => ({ variantId: l.variantId, qty: l.qty, price: l.price })),
        discount: discountMinor,
        payments: effectivePayments.map((p) => ({ method: p.method, amount: toMinor(p.amount || "0", currency), walletId: p.walletId })),
        note,
      });
      if (res.ok) {
        setResult({ ok: true, text: `Tersimpan: ${res.number}`, id: res.id });
        setCart([]);
        setDiscount("");
        setPayments([]);
        setNote("");
        setExternalRef("");
      } else setResult({ ok: false, text: res.error });
    });
  }

  const canSubmit = cart.length > 0 && effectiveLocation && paid === total && Number(rate) > 0 && !pending;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <section className="card space-y-3">
          <div>
            <span className="label">Sumber penjualan</span>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(CHANNELS).map(([k, label]) => (
                <button key={k} type="button" onClick={() => applyChannel(k as typeof channel)} className={channel === k ? "btn" : "btn-secondary"}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {channel === "EVENT" && (
              <div className="sm:col-span-2">
                <label className="label">Pameran / event</label>
                {events.length ? (
                  <select className="input" value={eventId ?? ""} onChange={(e) => applyChannel("EVENT", Number(e.target.value))}>
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} · {e.dates} · {e.currency}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-neutral-500">
                    Belum ada event aktif. <Link className="underline" href="/event">Buat event</Link>
                  </p>
                )}
              </div>
            )}
            {channel === "MARKETPLACE" && (
              <>
                <div>
                  <label className="label">Marketplace</label>
                  <select className="input" value={marketplace} onChange={(e) => { setMarketplace(e.target.value); setPayments([]); }}>
                    {Object.entries(MARKETPLACES).map(([k, l]) => (
                      <option key={k} value={k}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">No. pesanan (opsional)</label>
                  <input className="input" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
                </div>
              </>
            )}
            {channel !== "EVENT" && (
              <div>
                <label className="label">Stok diambil dari</label>
                <select className="input" value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Mata uang</label>
                <select className="input" value={currency} onChange={(e) => applyCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Kurs (IDR per 1 {currency})</label>
                <input className="input" inputMode="decimal" value={rate} disabled={currency === "IDR"} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <input className="input mb-3" placeholder="Cari nama produk, warna, atau SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="grid max-h-[480px] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {filtered.map((v) => {
              const p = priceFor(v, currency, Number(rate));
              const st = effectiveLocation ? v.stock[effectiveLocation] ?? 0 : 0;
              return (
                <button key={v.id} type="button" onClick={() => addVariant(v)} className="rounded-lg border border-neutral-200 p-3 text-left hover:border-neutral-900">
                  <div className="text-sm font-medium">{v.name}</div>
                  <div className="text-xs text-neutral-500">{v.detail || "-"} · {v.sku}</div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="tabular-nums">{formatMoney(p.price, currency)}{p.converted && <span className="text-xs text-amber-700"> *</span>}</span>
                    <span className={`text-xs ${st <= 0 ? "text-red-600" : "text-neutral-500"}`}>stok {st}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-neutral-500">* belum ada harga resmi dalam {currency}, dihitung dari harga IDR dibagi kurs.</p>
        </section>
      </div>

      <aside id="nota" className="card mb-16 h-fit scroll-mt-16 space-y-3 lg:sticky lg:top-16 lg:mb-0">
        <h2 className="text-sm font-semibold">Nota</h2>
        {cart.length === 0 && <p className="text-sm text-neutral-500">Pilih produk di sebelah kiri.</p>}
        {cart.map((l) => {
          const v = variants.find((x) => x.id === l.variantId)!;
          return (
            <div key={l.variantId} className="border-b border-neutral-100 pb-2">
              <div className="flex justify-between text-sm">
                <span>
                  {v.name} <span className="text-neutral-500">{v.detail}</span>
                </span>
                <button type="button" className="text-xs text-red-600" onClick={() => setCart((c) => c.filter((x) => x.variantId !== l.variantId))}>
                  hapus
                </button>
              </div>
              <div className="mt-1 grid grid-cols-[80px_1fr_auto] items-center gap-2">
                <input className="input" type="number" min={1} value={l.qty} onChange={(e) => setCart((c) => c.map((x) => (x.variantId === l.variantId ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} />
                <input
                  className="input"
                  inputMode="decimal"
                  defaultValue={fromMinor(l.price, currency)}
                  key={`${l.variantId}-${currency}-${l.price}`}
                  onBlur={(e) => setCart((c) => c.map((x) => (x.variantId === l.variantId ? { ...x, price: toMinor(e.target.value || "0", currency) || 0, converted: false } : x)))}
                />
                <span className="num text-sm">{formatMoney(l.qty * l.price, currency)}</span>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Diskon ({currency})</span>
          <input className="input w-32 text-right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
        </div>
        <div className="flex justify-between text-lg font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(total, currency)}</span>
        </div>
        {currency !== "IDR" && <div className="text-right text-xs text-neutral-500">≈ {formatMoney(Math.round(fromMinor(total, currency) * Number(rate || 0)), "IDR")}</div>}

        <div className="space-y-2 border-t border-neutral-200 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Pembayaran & penerima uang</span>
            <button type="button" className="text-xs underline" onClick={() => setPayments([...effectivePayments, { method: "TRANSFER", amount: "", walletId: defaultWallet("TRANSFER")?.id ?? 0 }])}>
              + bayar campur
            </button>
          </div>
          {curWallets.length === 0 && <p className="text-sm text-red-700">Belum ada dompet dalam {currency}. Tambahkan di Pengaturan.</p>}
          {effectivePayments.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 p-2">
              <select
                className="input"
                value={p.method}
                onChange={(e) => {
                  const next = [...effectivePayments];
                  next[i] = { ...p, method: e.target.value, walletId: defaultWallet(e.target.value)?.id ?? p.walletId };
                  setPayments(next);
                }}
              >
                {Object.entries(PAYMENT_METHODS).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
              <input
                className="input text-right"
                inputMode="decimal"
                value={p.amount}
                onChange={(e) => {
                  const next = [...effectivePayments];
                  next[i] = { ...p, amount: e.target.value };
                  setPayments(next);
                }}
              />
              <select
                className="input col-span-2"
                value={p.walletId}
                onChange={(e) => {
                  const next = [...effectivePayments];
                  next[i] = { ...p, walletId: Number(e.target.value) };
                  setPayments(next);
                }}
              >
                {curWallets.map((w) => (
                  <option key={w.id} value={w.id}>Uang masuk ke: {w.name}</option>
                ))}
              </select>
              {effectivePayments.length > 1 && (
                <button type="button" className="col-span-2 text-left text-xs text-red-600" onClick={() => setPayments(effectivePayments.filter((_, j) => j !== i))}>
                  hapus pembayaran ini
                </button>
              )}
            </div>
          ))}
          {paid !== total && cart.length > 0 && <p className="text-xs text-red-700">Pembayaran {formatMoney(paid, currency)} belum sama dengan total.</p>}
        </div>

        <input className="input" placeholder="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn w-full py-3 text-base" disabled={!canSubmit} onClick={submit}>
          {pending ? "Menyimpan..." : "Simpan penjualan"}
        </button>
        {result && (
          <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>
            {result.text}{" "}
            {result.id && (
              <Link className="underline" href={`/penjualan/${result.id}`}>lihat nota</Link>
            )}
          </p>
        )}
      </aside>

      {cart.length > 0 && (
        <a href="#nota" className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between bg-neutral-900 px-4 py-3 text-white lg:hidden">
          <span className="text-sm">{cart.reduce((s, l) => s + l.qty, 0)} barang · lihat nota</span>
          <span className="font-semibold tabular-nums">{formatMoney(total, currency)}</span>
        </a>
      )}
    </div>
  );
}
