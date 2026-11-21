import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/admin-session";
import { fmtDate } from "@/lib/time";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";
import { createPlatformAdmin, resetPlatformAdminPin, togglePlatformAdmin } from "../actions";
import { getT } from "@/lib/i18n";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Akun admin") };
}

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input w-28" } as const;

export default async function AkunAdminPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const me = await requirePlatformAdmin();
  const admins = await db.platformAdmin.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  const now = new Date();
  return (
    <div>
      <PageHeader title={t("Akun admin")} desc={t("Admin MG-POS masuk lewat /admin/login dengan nama dan PIN, terpisah dari akun toko.")} />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("Daftar admin")} className="lg:col-span-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Nama")}</th>
                <th>{t("Status")}</th>
                <th>{t("Dibuat")}</th>
                <th>{t("Ganti PIN")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className={a.active ? "" : "text-neutral-400"}>
                  <td>
                    {a.name}
                    {a.id === me.id && <span className="ml-1 text-xs text-neutral-500">{t("(Anda)")}</span>}
                  </td>
                  <td>{!a.active ? t("Nonaktif") : a.lockedUntil && a.lockedUntil > now ? <span className="text-red-700">{t("Terkunci")}</span> : t("Aktif")}</td>
                  <td>{fmtDate(a.createdAt)}</td>
                  <td>
                    <form action={resetPlatformAdminPin} className="flex gap-1">
                      <input type="hidden" name="id" value={a.id} />
                      {a.id === me.id && <input name="oldPin" placeholder={t("PIN lama")} required {...pinProps} />}
                      <input name="pin" placeholder={t("PIN baru")} required {...pinProps} />
                      <button className="btn-secondary">{t("Ganti")}</button>
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
        <Card title={t("Tambah admin")}>
          <form action={createPlatformAdmin} className="space-y-3">
            <div>
              <label className="label">{t("Nama")}</label>
              <input name="name" className="input" required maxLength={60} />
            </div>
            <div>
              <label className="label">{t("PIN awal (4-8 angka)")}</label>
              <input name="pin" required {...pinProps} className="input" />
            </div>
            <button className="btn">{t("Tambah admin")}</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">{t("Admin bisa mengatur semua toko dan semua akun. Berikan hanya ke orang yang dipercaya.")}</p>
        </Card>
      </div>
    </div>
  );
}
