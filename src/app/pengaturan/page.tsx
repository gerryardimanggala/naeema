import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { formatRate } from "@/lib/money";
import { CURRENCIES, LOCATION_TYPES, ROLES, WALLET_KINDS } from "@/lib/constants";
import { addRate, createLocation, createUser, createWallet, resetPin, toggleUser, toggleWallet } from "../actions";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";
import { fmtDate } from "@/lib/time";

export default async function PengaturanPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await requireAdmin();
  const [users, wallets, rates, locations] = await Promise.all([
    db.user.findMany({ orderBy: { name: "asc" } }),
    db.wallet.findMany({ include: { owner: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.exchangeRate.findMany({ orderBy: { date: "desc" }, take: 20 }),
    db.location.findMany({ where: { type: { not: "EVENT" } }, orderBy: { id: "asc" } }),
  ]);
  const latest = CURRENCIES.filter((c) => c !== "IDR").map((c) => rates.find((r) => r.currency === c));
  return (
    <div>
      <PageHeader title="Pengaturan" desc="Pengguna, dompet, kurs, dan lokasi stok." />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Kurs ke IDR">
          <div className="mb-3 grid grid-cols-2 gap-2">
            {latest.map((r, i) => (
              <div key={i} className="rounded-lg border border-neutral-200 p-3">
                <div className="text-xs text-neutral-500">1 {r?.currency ?? CURRENCIES[i + 1]}</div>
                <div className="text-lg font-semibold">{r ? `Rp ${formatRate(r.idrPerUnit)}` : "belum diisi"}</div>
                {r && <div className="text-xs text-neutral-500">{fmtDate(r.date)}</div>}
              </div>
            ))}
          </div>
          <form action={addRate} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label">Mata uang</label>
              <select name="currency" className="input">
                {CURRENCIES.filter((c) => c !== "IDR").map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="label">IDR per 1 unit</label>
              <input name="idrPerUnit" className="input" placeholder="mis. 3.650" required />
            </div>
            <button className="btn">Simpan kurs</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">Kurs ini jadi usulan di kasir. Setiap nota menyimpan kursnya sendiri, jadi mengubah kurs tidak mengubah nota lama.</p>
        </Card>

        <Card title="Lokasi stok">
          <ul className="mb-3 text-sm">
            {locations.map((l) => (
              <li key={l.id} className="flex justify-between border-b border-neutral-100 py-1.5">
                <span>{l.name}</span>
                <span className="badge">{LOCATION_TYPES[l.type]}</span>
              </li>
            ))}
          </ul>
          <form action={createLocation} className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className="label">Nama lokasi</label>
              <input name="name" className="input" required />
            </div>
            <div>
              <label className="label">Tipe</label>
              <select name="type" className="input">
                {Object.entries(LOCATION_TYPES).filter(([k]) => k !== "EVENT").map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </div>
            <button className="btn">Tambah</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">Lokasi booth pameran dibuat otomatis saat membuat event.</p>
        </Card>

        <Card title="Pengguna">
          <table className="tbl mb-3">
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "text-neutral-400"}>
                  <td>{u.name}</td>
                  <td>{ROLES[u.role]}</td>
                  <td>
                    {(u.role !== "OWNER" || me.role === "OWNER") && (
                      <form action={resetPin} className="flex gap-1">
                        <input type="hidden" name="id" value={u.id} />
                        <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} required placeholder="PIN baru" className="input w-24 px-2 py-1 text-xs" />
                        <button className="text-xs underline">ganti PIN</button>
                      </form>
                    )}
                  </td>
                  <td className="text-right">
                    {u.id !== me.id && (
                      <form action={toggleUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="text-xs underline">{u.active ? "nonaktifkan" : "aktifkan"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={createUser} className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Nama</label>
              <input name="name" className="input" required />
            </div>
            <div>
              <label className="label">Peran</label>
              <select name="role" className="input" defaultValue="STAFF">
                {Object.entries(ROLES).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">PIN awal (4-8 angka, beri tahu orangnya)</label>
              <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} required className="input" />
            </div>
            <div className="col-span-2 flex flex-wrap gap-3 text-sm">
              <span className="text-xs text-neutral-500">Buatkan dompet kas:</span>
              {CURRENCIES.map((c) => (
                <label key={c} className="flex items-center gap-1">
                  <input type="checkbox" name={`wallet_${c}`} defaultChecked={c === "IDR"} /> {c}
                </label>
              ))}
            </div>
            <button className="btn col-span-2">Tambah pengguna</button>
          </form>
        </Card>

        <Card title="Dompet & rekening">
          <table className="tbl mb-3">
            <tbody>
              {wallets.map((w) => (
                <tr key={w.id} className={w.active ? "" : "text-neutral-400"}>
                  <td>
                    {w.name}
                    <div className="text-xs text-neutral-500">
                      {WALLET_KINDS[w.kind]}
                      {w.owner && ` · ${w.owner.name}`}
                    </div>
                  </td>
                  <td>{w.currency}</td>
                  <td className="text-right">
                    <form action={toggleWallet}>
                      <input type="hidden" name="id" value={w.id} />
                      <button className="text-xs underline">{w.active ? "nonaktifkan" : "aktifkan"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={createWallet} className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="label">Nama</label>
              <input name="name" className="input" required placeholder="mis. Rekening Mandiri Naeema" />
            </div>
            <div>
              <label className="label">Jenis</label>
              <select name="kind" className="input">
                {Object.entries(WALLET_KINDS).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Mata uang</label>
              <select name="currency" className="input">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Pemegang (untuk jenis &quot;dipegang orang&quot;)</label>
              <select name="ownerId" className="input">
                <option value="">-</option>
                {users.filter((u) => u.active).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <button className="btn col-span-2">Tambah dompet</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
