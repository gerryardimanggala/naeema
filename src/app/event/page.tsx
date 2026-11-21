import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { COUNTRIES, CURRENCIES } from "@/lib/constants";
import { createEvent } from "../actions";
import { Card, Empty, Flash, PageHeader, str, type SP } from "@/components/ui";

export default async function EventPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const events = await db.event.findMany({ orderBy: { startDate: "desc" } });
  const totals = await db.sale.groupBy({ by: ["eventId"], _sum: { totalIdr: true, total: true }, _count: true, where: { status: "PAID", eventId: { not: null } } });
  const byEvent = new Map(totals.map((t) => [t.eventId, t]));
  return (
    <div>
      <PageHeader title="Pameran / event" desc="Setiap event punya lokasi stok sendiri (booth) dan mata uangnya sendiri." />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      {isAdmin(user) && (
        <Card title="Buat event baru" className="mb-4">
          <form action={createEvent} className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label">Nama pameran</label>
              <input name="name" className="input" required placeholder="mis. Hijab Fest Kuala Lumpur" />
            </div>
            <div>
              <label className="label">Kota</label>
              <input name="city" className="input" />
            </div>
            <div>
              <label className="label">Negara</label>
              <select name="country" className="input">
                {Object.entries(COUNTRIES).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Mulai</label>
              <input type="date" name="startDate" className="input" required />
            </div>
            <div>
              <label className="label">Selesai</label>
              <input type="date" name="endDate" className="input" required />
            </div>
            <div>
              <label className="label">Mata uang penjualan</label>
              <select name="currency" className="input">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Catatan</label>
              <input name="notes" className="input" placeholder="mis. nomor booth, tim yang jaga" />
            </div>
            <div className="sm:col-span-3">
              <button className="btn">Buat event</button>
            </div>
          </form>
        </Card>
      )}
      <Card>
        {events.length === 0 ? (
          <Empty>Belum ada event.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Event</th>
                <th>Tanggal</th>
                <th className="num">Nota</th>
                <th className="num">Penjualan</th>
                <th className="num">Setara IDR</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const t = byEvent.get(e.id);
                return (
                  <tr key={e.id}>
                    <td>
                      <Link className="font-medium underline" href={`/event/${e.id}`}>{e.name}</Link>
                      <div className="text-xs text-neutral-500">{[e.city, COUNTRIES[e.country]].filter(Boolean).join(", ")} · {e.currency}</div>
                    </td>
                    <td className="whitespace-nowrap">{e.startDate.toLocaleDateString("id-ID")} - {e.endDate.toLocaleDateString("id-ID")}</td>
                    <td className="num">{t?._count ?? 0}</td>
                    <td className="num">{formatMoney(t?._sum.total ?? 0, e.currency)}</td>
                    <td className="num">{formatMoney(t?._sum.totalIdr ?? 0, "IDR")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-neutral-500">Kolom penjualan menjumlahkan nota dalam mata uang event. Nota dengan mata uang lain tetap terhitung di kolom IDR.</p>
      </Card>
    </div>
  );
}
