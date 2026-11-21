import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/admin-session";
import { ROLES } from "@/lib/constants";
import { fmtDate, fmtDateTime, jakartaDay } from "@/lib/time";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";
import { StoreLogo } from "@/components/brand";
import { LOGO_ACCEPT } from "@/lib/logo";
import {
  adminCreateUser, adminResetPin, adminToggleUser, adminUnlockUser,
  approveBusiness, renameBusiness, toggleBusiness,
  extendSubscription, setSubscriptionDate, toggleFreePlan,
} from "../../actions";
import { getT } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { getSubSettings } from "@/lib/platform";
import { MONTH_CHOICES, subscriptionState } from "@/lib/subscription";
import { subBadge } from "@/components/SubBadge";

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input w-28" } as const;

export default async function AdminTokoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const t = await getT();
  await requirePlatformAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const business = await db.business.findUnique({
    where: { id: Number(id) || 0 },
    omit: { logo: true },
    include: { users: { orderBy: [{ active: "desc" }, { name: "asc" }] } },
  });
  if (!business) notFound();
  const [sales, products, subSettings, subPayments] = await Promise.all([
    db.sale.aggregate({ _count: true, _sum: { totalIdr: true }, where: { businessId: business.id, status: "PAID" } }),
    db.product.count({ where: { businessId: business.id } }),
    getSubSettings(),
    db.subscriptionPayment.findMany({ where: { businessId: business.id }, include: { admin: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const sub = subscriptionState(business, subSettings.graceDays);
  const lastLogin = await db.session.groupBy({
    by: ["userId"],
    _max: { createdAt: true },
    where: { user: { businessId: business.id } },
  });
  const loginOf = new Map(lastLogin.map((l) => [l.userId, l._max.createdAt]));
  const now = new Date();
  const hidden = (userId: number) => (
    <>
      <input type="hidden" name="id" value={userId} />
      <input type="hidden" name="businessId" value={business.id} />
    </>
  );

  return (
    <div>
      <PageHeader title={business.name} desc={t("Kode toko {slug} · daftar {date}", { slug: business.slug, date: fmtDate(business.createdAt) })}>
        <Link href="/admin" className="btn-secondary">{t("Kembali")}</Link>
      </PageHeader>
      <Flash ok={str(sp.ok)} error={str(sp.error)} />

      <section id="langganan" className="card mb-4 scroll-mt-20">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">{t("Langganan")}</h2>
          {subBadge(sub, t)}
          {business.paidUntil && !business.freePlan && (
            <span className="text-sm text-neutral-600">{t("Aktif sampai {date}", { date: fmtDate(business.paidUntil) })}</span>
          )}
          <form action={toggleFreePlan} className="ml-auto">
            <input type="hidden" name="id" value={business.id} />
            <button className="text-xs underline">{business.freePlan ? t("Jadikan berbayar") : t("Jadikan gratis")}</button>
          </form>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <form action={extendSubscription} className="space-y-2 rounded-lg border border-neutral-200 p-3">
            <input type="hidden" name="id" value={business.id} />
            <div className="text-sm font-medium">{t("Catat pembayaran & perpanjang")}</div>
            <div className="flex flex-wrap gap-2">
              {MONTH_CHOICES.map((m) => (
                <label key={m} className="flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-sm">
                  <input type="radio" name="months" value={m} defaultChecked={m === 1} required />
                  {t("{n} bulan", { n: m })}
                  {subSettings.priceMonthly > 0 && <span className="text-xs text-neutral-500">· {formatMoney(subSettings.priceMonthly * m, "IDR")}</span>}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">{t("Jumlah dibayar (Rp)")}</label>
                <input name="amount" inputMode="numeric" className="input" placeholder={t("kosong = sesuai harga")} />
              </div>
              <div>
                <label className="label">{t("Catatan")}</label>
                <input name="note" className="input" maxLength={200} placeholder={t("mis. transfer BCA 21/11")} />
              </div>
            </div>
            <button className="btn">{t("Perpanjang")}</button>
            <p className="text-xs text-neutral-500">
              {t("Kalau masih aktif, perpanjangan dihitung dari tanggal habis. Kalau sudah habis, dihitung dari hari ini.")}
            </p>
          </form>
          <form action={setSubscriptionDate} className="space-y-2 rounded-lg border border-neutral-200 p-3">
            <input type="hidden" name="id" value={business.id} />
            <div className="text-sm font-medium">{t("Atur tanggal habis langsung")}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">{t("Aktif sampai")}</label>
                <input type="date" name="until" className="input" required defaultValue={business.paidUntil ? jakartaDay(business.paidUntil) : jakartaDay()} />
              </div>
              <div>
                <label className="label">{t("Alasan")}</label>
                <input name="note" className="input" maxLength={200} placeholder={t("mis. bonus, koreksi")} />
              </div>
            </div>
            <button className="btn-secondary">{t("Simpan tanggal")}</button>
            <p className="text-xs text-neutral-500">{t("Untuk koreksi atau bonus, tanpa mencatat pembayaran.")}</p>
          </form>
        </div>
        {subPayments.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("Tanggal")}</th>
                  <th>{t("Lama")}</th>
                  <th className="num">{t("Dibayar")}</th>
                  <th>{t("Aktif sampai")}</th>
                  <th>{t("Catatan")}</th>
                  <th>{t("Oleh")}</th>
                </tr>
              </thead>
              <tbody>
                {subPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(p.createdAt)}</td>
                    <td>{p.months ? t("{n} bulan", { n: p.months }) : t("diatur admin")}</td>
                    <td className="num">{p.amount ? formatMoney(p.amount, "IDR") : "-"}</td>
                    <td>{fmtDate(p.toDate)}</td>
                    <td className="text-xs">{p.note}</td>
                    <td className="text-xs">{p.admin.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-neutral-500">
              {t("Total dibayar: {total}", { total: formatMoney(subPayments.reduce((s, p) => s + p.amount, 0), "IDR") })}
            </p>
          </div>
        )}
      </section>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("Toko")}>
          <form action={renameBusiness} className="mb-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={business.id} />
            <StoreLogo business={business} size={56} />
            <div className="min-w-[10rem] flex-1 space-y-2">
              <div>
                <label className="label">{t("Nama toko")}</label>
                <input name="name" defaultValue={business.name} className="input" required maxLength={80} />
              </div>
              <div>
                <label className="label">{t("Ganti logo (opsional)")}</label>
                <input name="logo" type="file" accept={LOGO_ACCEPT} className="input" />
              </div>
            </div>
            <button className="btn-secondary">{t("Simpan")}</button>
          </form>
          <p className="mb-3 text-sm text-neutral-600">
            {t("{products} produk · {sales} penjualan · {total}", { products, sales: sales._count, total: formatMoney(sales._sum.totalIdr ?? 0, "IDR") })}
          </p>
          {business.pending ? (
            <form action={approveBusiness}>
              <input type="hidden" name="id" value={business.id} />
              <button className="btn">{t("Setujui pendaftaran")}</button>
            </form>
          ) : (
            <form action={toggleBusiness} className="flex items-center gap-3">
              <input type="hidden" name="id" value={business.id} />
              <span className="text-sm">{t("Status:")} <b>{business.active ? t("Aktif") : t("Nonaktif")}</b></span>
              <button className={business.active ? "btn-danger" : "btn"}>{business.active ? t("Nonaktifkan toko") : t("Aktifkan lagi")}</button>
            </form>
          )}
          <p className="mt-2 text-xs text-neutral-500">{t("Toko nonaktif tidak bisa dipakai masuk, dan semua penggunanya langsung keluar. Datanya tetap tersimpan.")}</p>
        </Card>

        <Card title={t("Tambah pengguna")}>
          <form action={adminCreateUser} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="businessId" value={business.id} />
            <div className="flex-1">
              <label className="label">{t("Nama")}</label>
              <input name="name" className="input" required />
            </div>
            <div>
              <label className="label">{t("Peran")}</label>
              <select name="role" className="input" defaultValue="OWNER">
                {Object.entries(ROLES).map(([k, l]) => (
                  <option key={k} value={k}>{t(l)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("PIN awal")}</label>
              <input name="pin" required {...pinProps} />
            </div>
            <button className="btn">{t("Tambah")}</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">{t("Berguna kalau owner lupa PIN dan tidak ada admin lain di tokonya. Dompet kas IDR dibuat otomatis.")}</p>
        </Card>
      </div>

      <Card title={t("Akun")}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Nama")}</th>
                <th>{t("Peran")}</th>
                <th>{t("Status")}</th>
                <th>{t("Sesi login terakhir")}</th>
                <th>{t("Ganti PIN")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {business.users.map((u) => {
                const locked = u.lockedUntil && u.lockedUntil > now;
                const lastSeen = loginOf.get(u.id);
                return (
                  <tr key={u.id} className={u.active ? "" : "text-neutral-400"}>
                    <td>
                      {u.name}
                    </td>
                    <td>{t(ROLES[u.role])}</td>
                    <td>
                      {!u.active ? t("Nonaktif") : locked ? <span className="text-red-700">{t("Terkunci")}</span> : t("Aktif")}
                      {!u.pinHash && <span className="ml-1 text-xs text-amber-700">{t("(belum ada PIN)")}</span>}
                    </td>
                    <td className="text-xs">{lastSeen ? fmtDateTime(lastSeen) : "-"}</td>
                    <td>
                      <form action={adminResetPin} className="flex gap-1">
                        {hidden(u.id)}
                        <input name="pin" required placeholder={t("PIN baru")} {...pinProps} />
                        <button className="btn-secondary">{t("Ganti")}</button>
                      </form>
                    </td>
                    <td className="space-y-1 text-right text-xs">
                      {locked && (
                        <form action={adminUnlockUser}>
                          {hidden(u.id)}
                          <button className="underline">{t("buka kunci")}</button>
                        </form>
                      )}
                      <form action={adminToggleUser}>
                        {hidden(u.id)}
                        <button className="underline">{u.active ? t("nonaktifkan") : t("aktifkan")}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {t("Mengganti PIN juga membuka kunci akun dan mengakhiri sesi login lama orang itu.")}
        </p>
      </Card>
    </div>
  );
}
