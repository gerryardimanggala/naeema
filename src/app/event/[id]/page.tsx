import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { fmtDate, jakartaDay } from "@/lib/time";
import { latestRates } from "@/lib/reports";
import { toIdr } from "@/lib/money";
import { COUNTRIES, EXPENSE_CATEGORIES } from "@/lib/constants";
import { returnEventStockAction } from "../../actions";
import { Card, Flash, PageHeader, Stat, str, type SP } from "@/components/ui";

export default async function EventDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const ev = await db.event.findUnique({ where: { id: Number(id) }, include: { location: true } });
  if (!ev) notFound();
  const locId = ev.location?.id ?? -1;
  const [sales, expenses, movesIn, movesOut, saleItems, stocks, otherLocations, rates] = await Promise.all([
    db.sale.findMany({ where: { eventId: ev.id, status: "PAID" }, include: { payments: { include: { wallet: true } } } }),
    db.cashMove.findMany({ where: { eventId: ev.id, type: "EXPENSE", status: "CONFIRMED" }, include: { fromWallet: true } }),
    db.stockMove.groupBy({ by: ["variantId"], _sum: { qty: true }, where: { toLocationId: locId, type: { in: ["TRANSFER", "IN"] } } }),
    db.stockMove.groupBy({ by: ["variantId"], _sum: { qty: true }, where: { fromLocationId: locId, type: "TRANSFER" } }),
    db.saleItem.groupBy({ by: ["variantId"], _sum: { qty: true }, where: { sale: { eventId: ev.id, status: "PAID" } } }),
    db.stock.findMany({ where: { locationId: locId } }),
    db.location.findMany({ where: { active: true, type: { not: "EVENT" } } }),
    latestRates(),
  ]);
  const variantIds = [...new Set([...movesIn, ...saleItems, ...stocks].map((m) => m.variantId))];
  const variants = await db.variant.findMany({ where: { id: { in: variantIds } }, include: { product: true }, orderBy: { sku: "asc" } });
  const sum = (arr: { variantId: number; _sum: { qty: number | null } }[], v: number) => arr.find((x) => x.variantId === v)?._sum.qty ?? 0;

  const salesIdr = sales.reduce((s, x) => s + x.totalIdr, 0);
  const salesLocal = sales.filter((s) => s.currency === ev.currency).reduce((s, x) => s + x.total, 0);
  // Pengeluaran dihitung ke IDR dengan kurs terbaru (perkiraan).
  const expenseIdr = expenses.reduce((s, e) => s + toIdr(e.amount, e.fromWallet!.currency, rates[e.fromWallet!.currency] ?? 0), 0);

  const byWallet = new Map<number, { name: string; currency: string; amount: number }>();
  for (const s of sales)
    for (const p of s.payments) {
      const w = byWallet.get(p.walletId) ?? { name: p.wallet.name, currency: p.wallet.currency, amount: 0 };
      w.amount += p.amount;
      byWallet.set(p.walletId, w);
    }

  return (
    <div>
      <PageHeader
        title={ev.name}
        desc={`${[ev.city, COUNTRIES[ev.country]].filter(Boolean).join(", ")} · ${fmtDate(ev.startDate)} - ${fmtDate(ev.endDate)} · ${ev.currency}`}
      >
        <Link href={`/stok?tab=pindah`} className="btn-secondary">Kirim stok ke booth</Link>
        <Link href={`/penjualan?eventId=${ev.id}&from=${jakartaDay(ev.startDate)}`} className="btn-secondary">Lihat nota</Link>
      </PageHeader>
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      {ev.notes && <p className="mb-4 text-sm text-neutral-600">{ev.notes}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Penjualan" value={formatMoney(salesLocal, ev.currency)} sub={`${sales.length} nota`} />
        <Stat label="Setara IDR (kurs saat transaksi)" value={formatMoney(salesIdr, "IDR")} />
        <Stat label="Pengeluaran event" value={formatMoney(expenseIdr, "IDR")} sub="≈ IDR, kurs terbaru" />
        <Stat label="Hasil bersih (perkiraan)" value={formatMoney(salesIdr - expenseIdr, "IDR")} sub="belum termasuk HPP" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Uang hasil event masuk ke">
          <table className="tbl">
            <tbody>
              {[...byWallet.values()].map((w) => (
                <tr key={w.name}>
                  <td>{w.name}</td>
                  <td className="num">{formatMoney(w.amount, w.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-neutral-500">
            Posisi saldo terkini (setelah setoran) ada di <Link href="/kas" className="underline">halaman Kas</Link>.
          </p>
        </Card>
        <Card title="Pengeluaran">
          <table className="tbl">
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>
                    {EXPENSE_CATEGORIES[e.category ?? "LAINNYA"]}
                    <div className="text-xs text-neutral-500">{e.note} · {e.fromWallet?.name}</div>
                  </td>
                  <td className="num">{formatMoney(e.amount, e.fromWallet!.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Stok booth: dibawa, terjual, sisa" className="mt-4">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Produk</th>
                <th className="num">Dibawa</th>
                <th className="num">Terjual</th>
                <th className="num">Dikembalikan</th>
                <th className="num">Sisa di booth</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.product.name} <span className="text-neutral-500">{[v.color, v.size].filter(Boolean).join(" / ")}</span>
                  </td>
                  <td className="num">{sum(movesIn, v.id)}</td>
                  <td className="num">{sum(saleItems, v.id)}</td>
                  <td className="num">{sum(movesOut, v.id)}</td>
                  <td className="num">{stocks.find((s) => s.variantId === v.id)?.qty ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isAdmin(user) && ev.location && (
          <form action={returnEventStockAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="eventId" value={ev.id} />
            <div>
              <label className="label">Event selesai? Kembalikan semua sisa stok ke</label>
              <select name="toLocationId" className="input">
                {otherLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <button className="btn-secondary">Kembalikan sisa stok</button>
          </form>
        )}
      </Card>
    </div>
  );
}
