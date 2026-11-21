import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { dayRange, isoDate, cashPosition } from "@/lib/reports";
import { formatMoney, fromMinor } from "@/lib/money";
import { fmtDate } from "@/lib/time";
import { CHANNELS, EXPENSE_CATEGORIES, MARKETPLACES } from "@/lib/constants";
import { Card, PageHeader, str, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n";
import type { T } from "@/lib/i18n-core";

function Bars({ rows, t }: { rows: { label: string; value: number; sub?: string }[]; t: T }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-neutral-500">{t("Belum ada data.")}</p>;
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
  const t = await getT();
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
      <PageHeader title={t("Laporan")} desc={t("{from} - {to} · semua nilai disetarakan ke IDR dengan kurs saat transaksi", { from: fmtDate(start), to: fmtDate(end) })}>
        <Link href={`/laporan/export?${qs}`} className="btn-secondary">{t("Unduh CSV penjualan")}</Link>
      </PageHeader>
      <form className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">{t("Dari")}</label>
          <input type="date" name="from" defaultValue={isoDate(start)} className="input" />
        </div>
        <div>
          <label className="label">{t("Sampai")}</label>
          <input type="date" name="to" defaultValue={isoDate(end)} className="input" />
        </div>
        <button className="btn-secondary">{t("Tampilkan")}</button>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("Penjualan per sumber · total {total}", { total: formatMoney(total, "IDR") })}>
          <Bars rows={byChannel.map((c) => ({ label: t(CHANNELS[c.channel]), value: c._sum.totalIdr ?? 0, sub: t("{n} nota", { n: c._count }) }))} t={t} />
        </Card>
        <Card title={t("Per marketplace")}>
          <Bars rows={byMarketplace.map((c) => ({ label: t(MARKETPLACES[c.marketplace ?? "LAINNYA"]), value: c._sum.totalIdr ?? 0, sub: t("{n} nota", { n: c._count }) }))} t={t} />
        </Card>
        <Card title={t("Per pameran / event")}>
          <Bars rows={byEvent.map((c) => ({ label: events.find((e) => e.id === c.eventId)?.name ?? "-", value: c._sum.totalIdr ?? 0, sub: t("{n} nota", { n: c._count }) }))} t={t} />
        </Card>
        <Card title={t("Per mata uang")}>
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
        <Card title={t("Per kategori produk")}>
          <Bars rows={[...categoryMap.entries()].map(([k, v]) => ({ label: k, value: v }))} t={t} />
        </Card>
        <Card title={t("Per kasir")}>
          <Bars rows={byCashier.map((c) => ({ label: users.find((u) => u.id === c.cashierId)?.name ?? "-", value: c._sum.totalIdr ?? 0, sub: t("{n} nota", { n: c._count }) }))} t={t} />
        </Card>
      </div>

      <Card title={t("Rekonsiliasi uang per orang (periode ini)")} className="mt-4">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Dompet")}</th>
                <th className="num">{t("Dari penjualan")}</th>
                <th className="num">{t("Uang masuk lain")}</th>
                <th className="num">{t("Pengeluaran")}</th>
                <th className="num">{t("Disetor / diserahkan")}</th>
                <th className="num">{t("Saldo saat ini")}</th>
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
        <p className="mt-2 text-xs text-neutral-500">{t("Bandingkan kolom saldo dengan uang fisik yang dipegang. Jika beda, catat lewat Kas → Koreksi saldo beserta alasannya.")}</p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("Produk terlaris")}>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Produk")}</th>
                <th className="num">{t("Qty")}</th>
                <th className="num">{t("≈ IDR")}</th>
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
        <Card title={t("Pengeluaran")}>
          <table className="tbl">
            <tbody>
              {[...expenseByCat.entries()].map(([cat, m]) => (
                <tr key={cat}>
                  <td>{t(EXPENSE_CATEGORIES[cat])}</td>
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
