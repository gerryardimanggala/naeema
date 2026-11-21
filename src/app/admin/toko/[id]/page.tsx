import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/admin-session";
import { ROLES } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/time";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";
import { StoreLogo } from "@/components/brand";
import { LOGO_ACCEPT } from "@/lib/logo";
import {
  adminCreateUser, adminResetPin, adminToggleUser, adminUnlockUser,
  approveBusiness, renameBusiness, toggleBusiness,
} from "../../actions";
import { getT } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

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
  const [sales, products] = await Promise.all([
    db.sale.aggregate({ _count: true, _sum: { totalIdr: true }, where: { businessId: business.id, status: "PAID" } }),
    db.product.count({ where: { businessId: business.id } }),
  ]);
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
