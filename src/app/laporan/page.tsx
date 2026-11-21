import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { dayRange, isoDate, cashPosition } from "@/lib/reports";
import { formatMoney, fromMinor } from "@/lib/money";
import { fmtDate } from "@/lib/time";
import { CHANNELS, EXPENSE_CATEGORIES, MARKETPLACES } from "@/lib/constants";
import { Card, PageHeader, str, type SP } from "@/components/ui";

function Bars({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-neutral-500">Belum ada data.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm">
            <span>{r.label}</span>
            <span className="tabular-nums">{formatMoney(r.value, "IDR")}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-neutral-100">
            <div className="h-2 rounded bg-neutral-800" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.sub && <div className="text-xs text-neutral-500">{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export default async function LaporanPage({ searchParams }: { searchParams: SP }) {
  const me = await requireAdmin();
  const bid = me.businessId;
  const sp = await searchParams;
  const { start, end } = dayRange(str(sp.from), str(sp.to));
  const where = { businessId: bid, status: "PAID", date: { gte: start, lte: end } };
  const [byChannel, byMarketplace, byEvent, byCurrency, byCashier, items, expenses, events, users, wallets, position, cashMoves, payments] = await Promise.all([
    db.sale.groupBy({ by: ["channel"], _sum: { totalIdr: true }, _count: true, where }),
    db.sale.groupBy({ by: ["marketplace"], _sum: { totalIdr: true }, _count: true, where: { ...where, channel: "MARKETPLACE" } }),
    db.sale.groupBy({ by: ["eventId"], _sum: { totalIdr: true }, _count: true, where: { ...where, channel: "EVENT" } }),
    db.sale.groupBy({ by: ["currency"], _sum: { total: true, totalIdr: true }, where }),
    db.sale.groupBy({ by: ["cashierId"], _sum: { totalIdr: true }, _count: true, where }),
    db.saleItem.findMany({ where: { sale: where }, include: { variant: { include: { product: { include: { category: true } } } }, sale: true } }),
    db.cashMove.findMany({ where: { businessId: bid, type: "EXPENSE", status: "CONFIRMED", date: { gte: start, lte: end } }, include: { fromWallet: true } }),
    db.event.findMany({ where: { businessId: bid } }),
    db.user.findMany({ where: { businessId: bid } }),
    db.wallet.findMany({ where: { businessId: bid, kind: "PERSON" }, include: { owner: true } }),
    cashPosition(bid),
    db.cashMove.findMany({ where: { businessId: bid, status: "CONFIRMED", date: { gte: start, lte: end } } }),
    db.payment.findMany({ where: { sale: where } }),
  ]);
  const total = byChannel.reduce((s, c) => s + (c._sum.totalIdr ?? 0), 0);

  const productMap = new Map<string, { label: string; category: string; qty: number; idr: number }>();
  for (const i of items) {
    const key = i.variant.product.name;
    const p = productMap.get(key) ?? { label: key, category: i.variant.product.category.name, qty: 0, idr: 0 };
    p.qty += i.qty;
    p.idr += Math.round(fromMinor(i.qty * i.price, i.sale.currency) * (i.sale.total / Math.max(1, i.sale.subtotal)) * i.sale.rateToIdr);
    productMap.set(key, p);
  }
  const products = [...productMap.values()].sort((a, b) => b.qty - a.qty);
  const categoryMap = new Map<string, number>();
  for (const p of products) categoryMap.set(p.category, (categoryMap.get(p.category) ?? 0) + p.idr);

  const expenseByCat = new Map<string, Map<string, number>>();
  for (const e of expenses) {
    const cat = e.category ?? "LAINNYA";
    const m = expenseByCat.get(cat) ?? new Map<string, number>();
    m.set(e.fromWallet!.currency, (m.get(e.fromWallet!.currency) ?? 0) + e.amount);
    expenseByCat.set(cat, m);
  }

  // Rekonsiliasi per dompet orang dalam periode.
  const recon = wallets.map((w) => {
    const sales = payments.filter((p) => p.walletId === w.id).reduce((s, p) => s + p.amount, 0);
    const moneyIn = cashMoves.filter((m) => m.toWalletId === w.id).reduce((s, m) => s + (m.toAmount ?? m.amount), 0);
    const spent = cashMoves.filter((m) => m.fromWalletId === w.id && m.type === "EXPENSE").reduce((s, m) => s + m.amount, 0);
    const handed = cashMoves.filter((m) => m.fromWalletId === w.id && m.type !== "EXPENSE").reduce((s, m) => s + m.amount, 0);
    const now = position.rows.find((r) => r.wallet.id === w.id)?.balance ?? 0;
    return { w, sales, moneyIn, spent, handed, now };
  }).filter((r) => r.sales || r.moneyIn || r.spent || r.handed || r.now);

  const qs = `from=${isoDate(start)}&to=${isoDate(end)}`;
  return (
    <div>
      <PageHeader title="Laporan" desc={`${fmtDate(start)} - ${fmtDate(end)} · semua nilai disetarakan ke IDR dengan kurs saat transaksi`}>
        <Link href={`/laporan/export?${qs}`} className="btn-secondary">Unduh CSV penjualan</Link>
      </PageHeader>
      <form className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Dari</label>
          <input type="date" name="from" defaultValue={isoDate(start)} className="input" />
        </div>
        <div>
          <label className="label">Sampai</label>
          <input type="date" name="to" defaultValue={isoDate(end)} className="input" />
        </div>
        <button className="btn-secondary">Tampilkan</button>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Penjualan per sumber · total ${formatMoney(total, "IDR")}`}>
          <Bars rows={byChannel.map((c) => ({ label: CHANNELS[c.channel], value: c._sum.totalIdr ?? 0, sub: `${c._count} nota` }))} />
        </Card>
        <Card title="Per marketplace">
          <Bars rows={byMarketplace.map((c) => ({ label: MARKETPLACES[c.marketplace ?? "LAINNYA"], value: c._sum.totalIdr ?? 0, sub: `${c._count} nota` }))} />
        </Card>
        <Card title="Per pameran / event">
          <Bars rows={byEvent.map((c) => ({ label: events.find((e) => e.id === c.eventId)?.name ?? "-", value: c._sum.totalIdr ?? 0, sub: `${c._count} nota` }))} />
        </Card>
        <Card title="Per mata uang">
          <table className="tbl">
            <tbody>
              {byCurrency.map((c) => (
                <tr key={c.currency}>
                  <td>{c.currency}</td>
                  <td className="num">{formatMoney(c._sum.total ?? 0, c.currency)}</td>
                  <td className="num text-neutral-500">{formatMoney(c._sum.totalIdr ?? 0, "IDR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Per kategori produk">
          <Bars rows={[...categoryMap.entries()].map(([k, v]) => ({ label: k, value: v }))} />
        </Card>
        <Card title="Per kasir">
          <Bars rows={byCashier.map((c) => ({ label: users.find((u) => u.id === c.cashierId)?.name ?? "-", value: c._sum.totalIdr ?? 0, sub: `${c._count} nota` }))} />
        </Card>
      </div>

      <Card title="Rekonsiliasi uang per orang (periode ini)" className="mt-4">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Dompet</th>
                <th className="num">Dari penjualan</th>
                <th className="num">Uang masuk lain</th>
                <th className="num">Pengeluaran</th>
                <th className="num">Disetor / diserahkan</th>
                <th className="num">Saldo saat ini</th>
              </tr>
            </thead>
            <tbody>
              {recon.map((r) => (
                <tr key={r.w.id}>
                  <td>
                    {r.w.name}
                    <div className="text-xs text-neutral-500">{r.w.owner?.name}</div>
                  </td>
                  <td className="num">{formatMoney(r.sales, r.w.currency)}</td>
                  <td className="num">{formatMoney(r.moneyIn, r.w.currency)}</td>
                  <td className="num">{formatMoney(r.spent, r.w.currency)}</td>
                  <td className="num">{formatMoney(r.handed, r.w.currency)}</td>
                  <td className="num font-semibold">{formatMoney(r.now, r.w.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Bandingkan kolom saldo dengan uang fisik yang dipegang. Jika beda, catat lewat Kas → Koreksi saldo beserta alasannya.</p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Produk terlaris">
          <table className="tbl">
            <thead>
              <tr>
                <th>Produk</th>
                <th className="num">Qty</th>
                <th className="num">≈ IDR</th>
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 15).map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="num">{p.qty}</td>
                  <td className="num">{formatMoney(p.idr, "IDR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Pengeluaran">
          <table className="tbl">
            <tbody>
              {[...expenseByCat.entries()].map(([cat, m]) => (
                <tr key={cat}>
                  <td>{EXPENSE_CATEGORIES[cat]}</td>
                  <td className="num">{[...m.entries()].map(([cur, v]) => formatMoney(v, cur)).join(" + ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
