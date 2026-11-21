import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { SIGNUP_MODES, getPlatformSettings } from "@/lib/platform";
import { fmtDate } from "@/lib/time";
import { Card, Flash, PageHeader, Stat, str, type SP } from "@/components/ui";
import { adminCreateBusiness, approveBusiness, rejectBusiness, saveSignupSettings } from "./actions";

export const metadata = { title: "Admin platform" };

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input" } as const;

function status(b: { active: boolean; pending: boolean }) {
  if (b.pending) return <span className="badge bg-amber-100 text-amber-800">Menunggu</span>;
  if (!b.active) return <span className="badge bg-red-100 text-red-800">Nonaktif</span>;
  return <span className="badge bg-green-100 text-green-800">Aktif</span>;
}

export default async function AdminPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requirePlatformAdmin();
  const q = (str(sp.q) || "").trim();
  const [settings, businesses, owners, saleCounts, lastSales] = await Promise.all([
    getPlatformSettings(),
    db.business.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase() } }] } : {},
      include: { _count: { select: { users: true } } },
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
      <PageHeader title="Admin platform" desc="Mengatur pendaftaran toko dan akun di semua toko." />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Toko aktif" value={count((r) => r.active && !r.pending)} />
        <Stat label="Menunggu persetujuan" value={count((r) => r.pending)} />
        <Stat label="Nonaktif" value={count((r) => !r.active && !r.pending)} />
      </div>

      {pending.length > 0 && (
        <Card title="Pendaftaran menunggu persetujuan" className="mb-4">
          <div className="space-y-2">
            {pending.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex-1">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-neutral-600">
                    Kode toko {b.slug} · owner {ownerOf.get(b.id) ?? "-"} · daftar {fmtDate(b.createdAt)}
                  </div>
                </div>
                <form action={approveBusiness}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="btn">Setujui</button>
                </form>
                <form action={rejectBusiness}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="btn-danger">Tolak & hapus</button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Pendaftaran toko baru">
          <form action={saveSignupSettings} className="space-y-2">
            {Object.entries(SIGNUP_MODES).map(([k, label]) => (
              <label key={k} className="flex items-start gap-2 text-sm">
                <input type="radio" name="mode" value={k} defaultChecked={settings.mode === k} className="mt-1" />
                <span>{label}</span>
              </label>
            ))}
            <div>
              <label className="label">Kode undangan (untuk mode kode undangan)</label>
              <input name="code" defaultValue={settings.code} className="input" maxLength={60} autoComplete="off" />
            </div>
            <button className="btn">Simpan</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">Halaman pendaftaran: /daftar</p>
        </Card>

        <Card title="Buat toko baru">
          <form action={adminCreateBusiness} className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label">Nama bisnis</label>
              <input name="businessName" className="input" required maxLength={80} />
            </div>
            <div>
              <label className="label">Kode toko</label>
              <input name="store" className="input" required minLength={3} maxLength={30} autoCapitalize="none" placeholder="mis. toko-ani" />
            </div>
            <div>
              <label className="label">Nama owner</label>
              <input name="name" className="input" required />
            </div>
            <div>
              <label className="label">PIN awal owner</label>
              <input name="pin" required {...pinProps} />
            </div>
            <div className="sm:col-span-2">
              <button className="btn">Buat toko</button>
            </div>
          </form>
          <p className="mt-2 text-xs text-neutral-500">Toko langsung aktif. Berikan kode toko dan PIN awal ke owner, lalu minta owner mengganti PIN di menu Akun.</p>
        </Card>
      </div>

      <Card title="Semua toko">
        <form className="mb-3 flex gap-2">
          <input name="q" defaultValue={q} className="input max-w-xs" placeholder="Cari nama atau kode toko" />
          <button className="btn-secondary">Cari</button>
        </form>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Toko</th>
                <th>Kode</th>
                <th>Owner</th>
                <th>Status</th>
                <th className="num">Pengguna</th>
                <th className="num">Penjualan</th>
                <th>Terakhir jual</th>
                <th>Daftar</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/admin/toko/${b.id}`} className="font-medium underline">
                      {b.name}
                    </Link>
                  </td>
                  <td>{b.slug}</td>
                  <td>{ownerOf.get(b.id) ?? "-"}</td>
                  <td>{status(b)}</td>
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
