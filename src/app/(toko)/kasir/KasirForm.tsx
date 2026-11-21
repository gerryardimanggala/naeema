"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useT } from "@/components/I18nProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveSale } from "../actions";
import { CHANNELS, CURRENCIES, MARKETPLACES, PAYMENT_METHODS } from "@/lib/constants";
import { formatMoney, fromMinor, toMinor, decimals } from "@/lib/money";

type Variant = { id: number; sku: string; name: string; detail: string; priceIdr: number; prices: Record<string, number>; stock: Record<string, number> };
type Wallet = { id: number; name: string; kind: string; currency: string; ownerId: number | null };
type Ev = { id: number; name: string; currency: string; locationId: number; dates: string };
type Line = { variantId: number; qty: number; price: number; converted: boolean };
type Pay = { method: string; amount: string; walletId: number };
type Qr = { id: number; name: string; currency: string; walletId: number; note: string | null };

const STORAGE_KEY = "naeema-kasir-pref";
const AUTOPRINT_KEY = "naeema-kasir-autoprint";

export default function KasirForm(props: {
  userId: number;
  rates: Record<string, number>;
  qrs: Qr[];
  locations: { id: number; name: string; type: string }[];
  events: Ev[];
  variants: Variant[];
  wallets: Wallet[];
}) {
  const { userId, rates, qrs, locations, events, variants, wallets } = props;
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
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const [qrView, setQrView] = useState<{ payIndex: number | null; qrId: number } | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const router = useRouter();
  useEffect(() => {
    try {
      setAutoPrint(localStorage.getItem(AUTOPRINT_KEY) === "1");
    } catch {}
  }, []);

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
  const curQrs = qrs.filter((q) => q.currency === currency);

  function openQr(payIndex: number | null) {
    const current = payIndex != null ? effectivePayments[payIndex] : null;
    const match = curQrs.find((q) => q.walletId === current?.walletId) ?? curQrs[0];
    if (match) setQrView({ payIndex, qrId: match.id });
  }

  /** Tandai pembayaran memakai QR yang dipilih: metode QR, uang masuk ke dompet QR tersebut. */
  function applyQr(qr: Qr, payIndex: number | null) {
    const next = [...effectivePayments];
    if (payIndex != null && next[payIndex]) next[payIndex] = { ...next[payIndex], method: "QR", walletId: qr.walletId };
    else if (next.length <= 1) next.splice(0, next.length, { method: "QR", amount: String(fromMinor(total, currency)), walletId: qr.walletId });
    else next.push({ method: "QR", amount: "", walletId: qr.walletId });
    setPayments(next);
    setQrView(null);
  }

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
        if (autoPrint) {
          router.push(`/penjualan/${res.id}/struk?auto=1`);
          return;
        }
        setResult({ ok: true, text: t("Tersimpan: {number}", { number: res.number }), id: res.id });
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
            <span className="label">{t("Sumber penjualan")}</span>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(CHANNELS).map(([k, label]) => (
                <button key={k} type="button" onClick={() => applyChannel(k as typeof channel)} className={channel === k ? "btn" : "btn-secondary"}>
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {channel === "EVENT" && (
              <div className="sm:col-span-2">
                <label className="label">{t("Pameran / event")}</label>
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
                    {t("Belum ada event aktif.")} <Link className="underline" href="/event">{t("Buat event")}</Link>
                  </p>
                )}
              </div>
            )}
            {channel === "MARKETPLACE" && (
              <>
                <div>
                  <label className="label">{t("Marketplace")}</label>
                  <select className="input" value={marketplace} onChange={(e) => { setMarketplace(e.target.value); setPayments([]); }}>
                    {Object.entries(MARKETPLACES).map(([k, l]) => (
                      <option key={k} value={k}>{t(l)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">{t("No. pesanan (opsional)")}</label>
                  <input className="input" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
                </div>
              </>
            )}
            {channel !== "EVENT" && (
              <div>
                <label className="label">{t("Stok diambil dari")}</label>
                <select className="input" value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">{t("Mata uang")}</label>
                <select className="input" value={currency} onChange={(e) => applyCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t("Kurs (IDR per 1 {cur})", { cur: currency })}</label>
                <input className="input" inputMode="decimal" value={rate} disabled={currency === "IDR"} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <input className="input mb-3" placeholder={t("Cari nama produk, warna, atau SKU...")} value={search} onChange={(e) => setSearch(e.target.value)} />
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
                    <span className={`text-xs ${st <= 0 ? "text-red-600" : "text-neutral-500"}`}>{t("stok {n}", { n: st })}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-neutral-500">{t("* belum ada harga resmi dalam {cur}, dihitung dari harga IDR dibagi kurs.", { cur: currency })}</p>
        </section>
      </div>

      <aside id="nota" className="card mb-16 h-fit scroll-mt-16 space-y-3 lg:sticky lg:top-16 lg:mb-0">
        <h2 className="text-sm font-semibold">{t("Nota")}</h2>
        {cart.length === 0 && <p className="text-sm text-neutral-500">{t("Pilih produk di sebelah kiri.")}</p>}
        {cart.map((l) => {
          const v = variants.find((x) => x.id === l.variantId)!;
          return (
            <div key={l.variantId} className="border-b border-neutral-100 pb-2">
              <div className="flex justify-between text-sm">
                <span>
                  {v.name} <span className="text-neutral-500">{v.detail}</span>
                </span>
                <button type="button" className="text-xs text-red-600" onClick={() => setCart((c) => c.filter((x) => x.variantId !== l.variantId))}>
                  {t("hapus")}
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
          <span>{t("Diskon ({cur})", { cur: currency })}</span>
          <input className="input w-32 text-right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
        </div>
        <div className="flex justify-between text-lg font-semibold">
          <span>{t("Total")}</span>
          <span className="tabular-nums">{formatMoney(total, currency)}</span>
        </div>
        {currency !== "IDR" && <div className="text-right text-xs text-neutral-500">≈ {formatMoney(Math.round(fromMinor(total, currency) * Number(rate || 0)), "IDR")}</div>}

        <div className="space-y-2 border-t border-neutral-200 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{t("Pembayaran & penerima uang")}</span>
            <div className="flex gap-3">
              {curQrs.length > 0 && !effectivePayments.some((p) => p.method === "QR") && (
                <button type="button" className="text-xs font-medium underline" onClick={() => openQr(null)}>
                  {t("Bayar pakai QR")}
                </button>
              )}
              <button type="button" className="text-xs underline" onClick={() => setPayments([...effectivePayments, { method: "TRANSFER", amount: "", walletId: defaultWallet("TRANSFER")?.id ?? 0 }])}>
                {t("+ bayar campur")}
              </button>
            </div>
          </div>
          {curWallets.length === 0 && <p className="text-sm text-red-700">{t("Belum ada dompet dalam {cur}. Tambahkan di Pengaturan.", { cur: currency })}</p>}
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
                  <option key={k} value={k}>{t(l)}</option>
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
                  <option key={w.id} value={w.id}>{t("Uang masuk ke: {name}", { name: w.name })}</option>
                ))}
              </select>
              {p.method === "QR" && curQrs.length > 0 && (
                <button type="button" className="btn-secondary col-span-2" onClick={() => openQr(i)}>
                  {t("Tampilkan QR ke pembeli")}
                </button>
              )}
              {effectivePayments.length > 1 && (
                <button type="button" className="col-span-2 text-left text-xs text-red-600" onClick={() => setPayments(effectivePayments.filter((_, j) => j !== i))}>
                  {t("hapus pembayaran ini")}
                </button>
              )}
            </div>
          ))}
          {paid !== total && cart.length > 0 && <p className="text-xs text-red-700">{t("Pembayaran {paid} belum sama dengan total.", { paid: formatMoney(paid, currency) })}</p>}
        </div>

        <input className="input" placeholder={t("Catatan (opsional)")} value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          <input
            type="checkbox"
            checked={autoPrint}
            onChange={(e) => {
              setAutoPrint(e.target.checked);
              try {
                localStorage.setItem(AUTOPRINT_KEY, e.target.checked ? "1" : "0");
              } catch {}
            }}
          />
          {t("Langsung buka struk setelah simpan")}
        </label>
        <button type="button" className="btn w-full py-3 text-base" disabled={!canSubmit} onClick={submit}>
          {pending ? t("Menyimpan...") : t("Simpan penjualan")}
        </button>
        {result && (
          <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>
            {result.text}{" "}
            {result.id && (
              <>
                <Link className="underline" href={`/penjualan/${result.id}/struk`}>{t("cetak struk")}</Link>
                {" · "}
                <Link className="underline" href={`/penjualan/${result.id}`}>{t("lihat nota")}</Link>
              </>
            )}
          </p>
        )}
      </aside>

      {qrView && (() => {
        const qr = curQrs.find((q) => q.id === qrView.qrId) ?? curQrs[0];
        if (!qr) return null;
        const row = qrView.payIndex != null ? effectivePayments[qrView.payIndex] : null;
        const amount = row ? toMinor(row.amount || "0", currency) || 0 : total;
        return (
          <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-white p-4" role="dialog" aria-modal="true" aria-label={`QR ${qr.name}`}>
            {curQrs.length > 1 && (
              <div className="mb-3 flex flex-wrap justify-center gap-2">
                {curQrs.map((q) => (
                  <button key={q.id} type="button" className={q.id === qr.id ? "btn" : "btn-secondary"} onClick={() => setQrView({ ...qrView, qrId: q.id })}>
                    {q.name}
                  </button>
                ))}
              </div>
            )}
            <div className="text-lg font-semibold">{qr.name}</div>
            {qr.note && <div className="text-sm text-neutral-600">{qr.note}</div>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/qr/${qr.id}`} alt={`QR ${qr.name}`} className="my-3 w-full max-w-md flex-1 object-contain" style={{ maxHeight: "60vh" }} />
            <div className="text-sm text-neutral-500">{t("Total yang harus dibayar")}</div>
            <div className="mb-4 text-4xl font-bold tabular-nums">{formatMoney(amount, currency)}</div>
            <div className="flex w-full max-w-md gap-2">
              <button type="button" className="btn-secondary flex-1 py-3" onClick={() => setQrView(null)}>
                {t("Tutup")}
              </button>
              <button type="button" className="btn flex-1 py-3" onClick={() => applyQr(qr, qrView.payIndex)}>
                {t("Pembayaran QR diterima")}
              </button>
            </div>
          </div>
        );
      })()}

      {cart.length > 0 && (
        <a href="#nota" className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between bg-neutral-900 px-4 py-3 text-white lg:hidden">
          <span className="text-sm">{t("{n} barang · lihat nota", { n: cart.reduce((s, l) => s + l.qty, 0) })}</span>
          <span className="font-semibold tabular-nums">{formatMoney(total, currency)}</span>
        </a>
      )}
    </div>
  );
}
