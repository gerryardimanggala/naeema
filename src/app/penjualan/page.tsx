import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { dayRange, isoDate } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { CHANNELS, MARKETPLACES } from "@/lib/constants";
import { Card, Empty, Flash, PageHeader, str, type SP } from "@/components/ui";
import { fmtDateTime } from "@/lib/time";

export default async function PenjualanPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const admin = isAdmin(user);
  const { start, end } = dayRange(str(sp.from), str(sp.to));
  const channel = str(sp.channel) || "";
  const eventId = Number(str(sp.eventId)) || undefined;
  const [sales, events] = await Promise.all([
    db.sale.findMany({
      where: {
        date: { gte: start, lte: end },
        ...(channel ? { channel } : {}),
        ...(eventId ? { eventId } : {}),
        ...(admin ? {} : { cashierId: user.id }),
      },
      include: { event: true, cashier: true, payments: { include: { wallet: true } }, _count: { select: { items: true } } },
      orderBy: { date: "desc" },
      take: 500,
    }),
    db.event.findMany({ orderBy: { startDate: "desc" } }),
  ]);
  const paid = sales.filter((s) => s.status === "PAID");
  const totalIdr = paid.reduce((s, x) => s + x.totalIdr, 0);

  return (
    <div>
      <PageHeader title="Penjualan" desc={admin ? "Semua nota penjualan." : "Nota yang saya input."}>
        <Link href="/kasir" className="btn">+ Penjualan baru</Link>
      </PageHeader>
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      <form className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div>
          <label className="label">Dari</label>
          <input type="date" name="from" defaultValue={isoDate(start)} className="input" />
        </div>
        <div>
          <label className="label">Sampai</label>
          <input type="date" name="to" defaultValue={isoDate(end)} className="input" />
        </div>
        <div>
          <label className="label">Sumber</label>
          <select name="channel" defaultValue={channel} className="input">
            <option value="">Semua</option>
            {Object.entries(CHANNELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Event</label>
          <select name="eventId" defaultValue={eventId ?? ""} className="input">
            <option value="">Semua</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-secondary w-full">Tampilkan</button>
        </div>
      </form>
      <Card>
        <div className="mb-2 text-sm text-neutral-600">
          {paid.length} nota · total {formatMoney(totalIdr, "IDR")}
        </div>
        {sales.length === 0 ? (
          <Empty>Belum ada penjualan di periode ini.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nota</th>
                  <th>Tanggal</th>
                  <th>Sumber</th>
                  <th>Kasir</th>
                  <th>Uang masuk ke</th>
                  <th className="num">Total</th>
                  <th className="num">Setara IDR</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className={s.status === "VOID" ? "text-neutral-400 line-through" : ""}>
                    <td>
                      <Link href={`/penjualan/${s.id}`} className="font-medium underline">{s.number}</Link>
                    </td>
                    <td className="whitespace-nowrap">{fmtDateTime(s.date)}</td>
                    <td>
                      {CHANNELS[s.channel]}
                      {s.marketplace && <div className="text-xs text-neutral-500">{MARKETPLACES[s.marketplace]}</div>}
                      {s.event && <div className="text-xs text-neutral-500">{s.event.name}</div>}
                    </td>
                    <td>{s.cashier.name}</td>
                    <td className="text-xs">{s.payments.map((p) => p.wallet.name).join(", ")}</td>
                    <td className="num">{formatMoney(s.total, s.currency)}</td>
                    <td className="num">{formatMoney(s.totalIdr, "IDR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
