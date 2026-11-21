import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/admin-session";
import { fmtDate } from "@/lib/time";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";
import { createPlatformAdmin, resetPlatformAdminPin, togglePlatformAdmin } from "../actions";

export const metadata = { title: "Akun admin" };

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input w-28" } as const;

export default async function AkunAdminPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await requirePlatformAdmin();
  const admins = await db.platformAdmin.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  const now = new Date();
  return (
    <div>
      <PageHeader title="Akun admin" desc="Admin MG-POS masuk lewat /admin/login dengan nama dan PIN, terpisah dari akun toko." />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Daftar admin" className="lg:col-span-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Status</th>
                <th>Dibuat</th>
                <th>Ganti PIN</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className={a.active ? "" : "text-neutral-400"}>
                  <td>
                    {a.name}
                    {a.id === me.id && <span className="ml-1 text-xs text-neutral-500">(Anda)</span>}
                  </td>
                  <td>{!a.active ? "Nonaktif" : a.lockedUntil && a.lockedUntil > now ? <span className="text-red-700">Terkunci</span> : "Aktif"}</td>
                  <td>{fmtDate(a.createdAt)}</td>
                  <td>
                    <form action={resetPlatformAdminPin} className="flex gap-1">
                      <input type="hidden" name="id" value={a.id} />
                      {a.id === me.id && <input name="oldPin" placeholder="PIN lama" required {...pinProps} />}
                      <input name="pin" placeholder="PIN baru" required {...pinProps} />
                      <button className="btn-secondary">Ganti</button>
                    </form>
                  </td>
                  <td className="text-right text-xs">
                    {a.id !== me.id && (
                      <form action={togglePlatformAdmin}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="underline">{a.active ? "nonaktifkan" : "aktifkan"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Tambah admin">
          <form action={createPlatformAdmin} className="space-y-3">
            <div>
              <label className="label">Nama</label>
              <input name="name" className="input" required maxLength={60} />
            </div>
            <div>
              <label className="label">PIN awal (4-8 angka)</label>
              <input name="pin" required {...pinProps} className="input" />
            </div>
            <button className="btn">Tambah admin</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">Admin bisa mengatur semua toko dan semua akun. Berikan hanya ke orang yang dipercaya.</p>
        </Card>
      </div>
    </div>
  );
}
