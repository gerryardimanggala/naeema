import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/admin-session";
import { SIGNUP_MODES, getPlatformSettings } from "@/lib/platform";
import { fmtDate } from "@/lib/time";
import { Card, Flash, PageHeader, Stat, str, type SP } from "@/components/ui";
import { StoreLogo } from "@/components/brand";
import { LOGO_ACCEPT } from "@/lib/logo";
import { adminCreateBusiness, approveBusiness, rejectBusiness, saveSignupSettings } from "./actions";
import { getT } from "@/lib/i18n";
import type { T } from "@/lib/i18n-core";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Toko|menu") };
}

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input" } as const;

function status(b: { active: boolean; pending: boolean }, t: T) {
  if (b.pending) return <span className="badge bg-amber-100 text-amber-800">{t("Menunggu")}</span>;
  if (!b.active) return <span className="badge bg-red-100 text-red-800">{t("Nonaktif")}</span>;
  return <span className="badge bg-green-100 text-green-800">{t("Aktif")}</span>;
}

export default async function AdminPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  await requirePlatformAdmin();
  const q = (str(sp.q) || "").trim();
  const [settings, businesses, owners, saleCounts, lastSales] = await Promise.all([
    getPlatformSettings(),
    db.business.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase() } }] } : {},
      include: { _count: { select: { users: true } } },
      omit: { logo: true },
      orderBy: [{ pending: "desc" }, { createdAt: "desc" }],
    }),
    db.user.findMany({ where: { role: "OWNER" }, select: { businessId: true, name: true }, orderBy: { id: "asc" } }),
    db.sale.groupBy({ by: ["businessId"], _count: true, where: { status: "PAID" } }),
    db.sale.groupBy({ by: ["businessId"], _max: { date: true } }),
  ]);
  const ownerOf = new Map<number, string>();
  for (const o of owners) if (!ownerOf.has(o.businessId)) ownerOf.set(o.businessId, o.name);
  const sales = new Map(saleCounts.map((s) => [s.businessId, s._count]));
  const last = new Map(lastSales.map((s) => [s.businessId, s._max.date]));
  const pending = businesses.filter((b) => b.pending);
  const all = await db.business.groupBy({ by: ["active", "pending"], _count: true });
  const count = (f: (r: (typeof all)[number]) => boolean) => all.filter(f).reduce((s, r) => s + r._count, 0);

  return (
    <div>
      <PageHeader title={t("Toko|menu")} desc={t("Mengatur pendaftaran toko dan akun di semua toko MG-POS.")} />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label={t("Toko aktif")} value={count((r) => r.active && !r.pending)} />
        <Stat label={t("Menunggu persetujuan")} value={count((r) => r.pending)} />
        <Stat label={t("Nonaktif")} value={count((r) => !r.active && !r.pending)} />
      </div>

      {pending.length > 0 && (
        <Card title={t("Pendaftaran menunggu persetujuan")} className="mb-4">
          <div className="space-y-2">
            {pending.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex-1">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-neutral-600">
                    {t("Kode toko {slug} · owner {owner} · daftar {date}", { slug: b.slug, owner: ownerOf.get(b.id) ?? "-", date: fmtDate(b.createdAt) })}
                  </div>
                </div>
                <form action={approveBusiness}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="btn">{t("Setujui")}</button>
                </form>
                <form action={rejectBusiness}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="btn-danger">{t("Tolak & hapus")}</button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("Pendaftaran toko baru")}>
          <form action={saveSignupSettings} className="space-y-2">
            {Object.entries(SIGNUP_MODES).map(([k, label]) => (
              <label key={k} className="flex items-start gap-2 text-sm">
                <input type="radio" name="mode" value={k} defaultChecked={settings.mode === k} className="mt-1" />
                <span>{t(label)}</span>
              </label>
            ))}
            <div>
              <label className="label">{t("Kode undangan (untuk mode kode undangan)")}</label>
              <input name="code" defaultValue={settings.code} className="input" maxLength={60} autoComplete="off" />
            </div>
            <button className="btn">{t("Simpan")}</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">{t("Halaman pendaftaran: /daftar")}</p>
        </Card>

        <Card title={t("Buat toko baru")}>
          <form action={adminCreateBusiness} className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label">{t("Nama bisnis")}</label>
              <input name="businessName" className="input" required maxLength={80} />
            </div>
            <div>
              <label className="label">{t("Kode toko")}</label>
              <input name="store" className="input" required minLength={3} maxLength={30} autoCapitalize="none" placeholder={t("mis. toko-ani")} />
            </div>
            <div>
              <label className="label">{t("Nama owner")}</label>
              <input name="name" className="input" required />
            </div>
            <div>
              <label className="label">{t("PIN awal owner")}</label>
              <input name="pin" required {...pinProps} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{t("Logo toko (PNG/JPG/WEBP, maks. 512 KB)")}</label>
              <input name="logo" type="file" accept={LOGO_ACCEPT} className="input" />
            </div>
            <div className="sm:col-span-2">
              <button className="btn">{t("Buat toko")}</button>
            </div>
          </form>
          <p className="mt-2 text-xs text-neutral-500">{t("Toko langsung aktif. Berikan kode toko dan PIN awal ke owner, lalu minta owner mengganti PIN di menu Akun.")}</p>
        </Card>
      </div>

      <Card title={t("Semua toko")}>
        <form className="mb-3 flex gap-2">
          <input name="q" defaultValue={q} className="input max-w-xs" placeholder={t("Cari nama atau kode toko")} />
          <button className="btn-secondary">{t("Cari")}</button>
        </form>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Toko")}</th>
                <th>{t("Kode")}</th>
                <th>{t("Owner")}</th>
                <th>{t("Status")}</th>
                <th className="num">{t("Pengguna")}</th>
                <th className="num">{t("Penjualan")}</th>
                <th>{t("Terakhir jual")}</th>
                <th>{t("Daftar")}</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/admin/toko/${b.id}`} className="flex items-center gap-2 font-medium underline">
                      <StoreLogo business={b} size={24} />
                      {b.name}
                    </Link>
                  </td>
                  <td>{b.slug}</td>
                  <td>{ownerOf.get(b.id) ?? "-"}</td>
                  <td>{status(b, t)}</td>
                  <td className="num">{b._count.users}</td>
                  <td className="num">{sales.get(b.id) ?? 0}</td>
                  <td>{last.get(b.id) ? fmtDate(last.get(b.id)!) : "-"}</td>
                  <td>{fmtDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
