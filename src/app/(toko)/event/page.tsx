import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/time";
import { COUNTRIES, CURRENCIES } from "@/lib/constants";
import { createEvent } from "../actions";
import { Card, Empty, Flash, PageHeader, str, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n";

export default async function EventPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await requireUser();
  const events = await db.event.findMany({ where: { businessId: user.businessId }, orderBy: { startDate: "desc" } });
  const totals = await db.sale.groupBy({ by: ["eventId"], _sum: { totalIdr: true, total: true }, _count: true, where: { businessId: user.businessId, status: "PAID", eventId: { not: null } } });
  const byEvent = new Map(totals.map((x) => [x.eventId, x]));
  return (
    <div>
      <PageHeader title={t("Pameran / event")} desc={t("Setiap event punya lokasi stok sendiri (booth) dan mata uangnya sendiri.")} />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      {isAdmin(user) && (
        <Card title={t("Buat event baru")} className="mb-4">
          <form action={createEvent} className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label">{t("Nama pameran")}</label>
              <input name="name" className="input" required placeholder={t("mis. Hijab Fest Kuala Lumpur")} />
            </div>
            <div>
              <label className="label">{t("Kota")}</label>
              <input name="city" className="input" />
            </div>
            <div>
              <label className="label">{t("Negara")}</label>
              <select name="country" className="input">
                {Object.entries(COUNTRIES).map(([k, l]) => (
                  <option key={k} value={k}>{t(l)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("Mulai")}</label>
              <input type="date" name="startDate" className="input" required />
            </div>
            <div>
              <label className="label">{t("Selesai")}</label>
              <input type="date" name="endDate" className="input" required />
            </div>
            <div>
              <label className="label">{t("Mata uang penjualan")}</label>
              <select name="currency" className="input">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">{t("Catatan")}</label>
              <input name="notes" className="input" placeholder={t("mis. nomor booth, tim yang jaga")} />
            </div>
            <div className="sm:col-span-3">
              <button className="btn">{t("Buat event")}</button>
            </div>
          </form>
        </Card>
      )}
      <Card>
        {events.length === 0 ? (
          <Empty>{t("Belum ada event.")}</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Event")}</th>
                <th>{t("Tanggal")}</th>
                <th className="num">{t("Nota")}</th>
                <th className="num">{t("Penjualan")}</th>
                <th className="num">{t("Setara IDR")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const agg = byEvent.get(e.id);
                return (
                  <tr key={e.id}>
                    <td>
                      <Link className="font-medium underline" href={`/event/${e.id}`}>{e.name}</Link>
                      <div className="text-xs text-neutral-500">{[e.city, t(COUNTRIES[e.country])].filter(Boolean).join(", ")} · {e.currency}</div>
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(e.startDate)} - {fmtDate(e.endDate)}</td>
                    <td className="num">{agg?._count ?? 0}</td>
                    <td className="num">{formatMoney(agg?._sum.total ?? 0, e.currency)}</td>
                    <td className="num">{formatMoney(agg?._sum.totalIdr ?? 0, "IDR")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-neutral-500">{t("Kolom penjualan menjumlahkan nota dalam mata uang event. Nota dengan mata uang lain tetap terhitung di kolom IDR.")}</p>
      </Card>
    </div>
  );
}
