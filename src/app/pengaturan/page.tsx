import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { formatRate } from "@/lib/money";
import { CURRENCIES, LOCATION_TYPES, ROLES, WALLET_KINDS } from "@/lib/constants";
import { addRate, saveBusiness, saveCategory, createLocation, createPaymentQr, createUser, createWallet, deletePaymentQr, resetPin, saveReceiptSettings, togglePaymentQr, toggleUser, toggleWallet } from "../actions";
import { getReceiptSettings } from "@/lib/settings";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";
import { fmtDate } from "@/lib/time";

export default async function PengaturanPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await requireAdmin();
  const bid = me.businessId;
  const [users, wallets, rates, locations] = await Promise.all([
    db.user.findMany({ where: { businessId: bid }, orderBy: { name: "asc" } }),
    db.wallet.findMany({ where: { businessId: bid }, include: { owner: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.exchangeRate.findMany({ where: { businessId: bid }, orderBy: { date: "desc" }, take: 20 }),
    db.location.findMany({ where: { businessId: bid, type: { not: "EVENT" } }, orderBy: { id: "asc" } }),
  ]);
  const receipt = await getReceiptSettings(bid);
  const qrs = await db.paymentQr.findMany({ where: { businessId: bid }, select: { id: true, name: true, currency: true, active: true, note: true, wallet: { select: { name: true } } }, orderBy: [{ currency: "asc" }, { name: "asc" }] });
  const [business, categories] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: bid } }),
    db.category.findMany({ where: { businessId: bid }, include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } }),
  ]);
  const latest = CURRENCIES.filter((c) => c !== "IDR").map((c) => rates.find((r) => r.currency === c));
  return (
    <div>
      <PageHeader title="Pengaturan" desc="Bisnis, kategori, pengguna, dompet, kurs, dan lokasi stok." />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Bisnis">
          <form action={saveBusiness} className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className="label">Nama bisnis</label>
              <input name="name" defaultValue={business.name} className="input" required maxLength={80} disabled={me.role !== "OWNER"} />
            </div>
            {me.role === "OWNER" && <button className="btn">Simpan</button>}
          </form>
          <p className="mt-2 text-sm">
            Kode toko: <b>{business.slug}</b>
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Tim Anda memasukkan kode toko ini saat pertama kali masuk di perangkat baru. Nama bisnis tampil di menu atas dan di struk
            (kalau nama toko di pengaturan struk dikosongkan).
          </p>
        </Card>

        <Card title="Kategori produk">
          <div id="kategori" className="space-y-2">
            {categories.map((c) => (
              <form key={c.id} action={saveCategory} className="flex items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input name="name" defaultValue={c.name} className="input flex-1" required maxLength={60} />
                <span className="w-16 text-right text-xs text-neutral-500">{c._count.products} produk</span>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="active" defaultChecked={c.active} /> aktif
                </label>
                <button className="btn-secondary">Simpan</button>
              </form>
            ))}
            {!categories.length && <p className="text-sm text-neutral-500">Belum ada kategori.</p>}
          </div>
          <form action={saveCategory} className="mt-3 flex items-end gap-2 border-t border-neutral-200 pt-3">
            <div className="flex-1">
              <label className="label">Kategori baru</label>
              <input name="name" className="input" required maxLength={60} placeholder="mis. Hijab, Mukena, Aksesoris" />
            </div>
            <button className="btn">Tambah</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">Kategori nonaktif tidak muncul saat menambah produk baru, tapi produk lama tetap tersimpan.</p>
        </Card>

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

        <Card title="QR pembayaran">
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {qrs.map((q) => (
              <div key={q.id} className={`rounded-lg border border-neutral-200 p-2 text-xs ${q.active ? "" : "opacity-50"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/qr/${q.id}`} alt={`QR ${q.name}`} className="mb-1 aspect-square w-full rounded bg-white object-contain" />
                <div className="font-medium">{q.name}</div>
                <div className="text-neutral-500">
                  {q.currency} · masuk ke {q.wallet.name}
                </div>
                {q.note && <div className="text-neutral-500">{q.note}</div>}
                <div className="mt-1 flex gap-3">
                  <form action={togglePaymentQr}>
                    <input type="hidden" name="id" value={q.id} />
                    <button className="underline">{q.active ? "nonaktifkan" : "aktifkan"}</button>
                  </form>
                  <form action={deletePaymentQr}>
                    <input type="hidden" name="id" value={q.id} />
                    <button className="text-red-700 underline">hapus</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          <form action={createPaymentQr} className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Nama</label>
              <input name="name" className="input" required placeholder="mis. QRIS BCA, Touch 'n Go" />
            </div>
            <div>
              <label className="label">Uang masuk ke</label>
              <select name="walletId" className="input" required>
                {wallets.filter((w) => w.active).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.currency})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Gambar QR (PNG/JPG, maks. 1 MB)</label>
              <input name="image" type="file" accept="image/png,image/jpeg,image/webp" required className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Catatan untuk pembeli (opsional)</label>
              <input name="note" className="input" placeholder="mis. a.n. nama rekening" />
            </div>
            <button className="btn col-span-2">Tambah QR</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">Mata uang QR mengikuti dompet penerimanya. Di kasir, QR yang muncul hanya yang sesuai mata uang penjualan.</p>
        </Card>

        <Card title="Struk (printer thermal)">
          <form action={saveReceiptSettings} className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="label">Nama toko di struk</label>
              <input name="storeName" defaultValue={receipt.storeName} className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Alamat</label>
              <input name="address" defaultValue={receipt.address} className="input" />
            </div>
            <div>
              <label className="label">Telepon / Instagram</label>
              <input name="phone" defaultValue={receipt.phone} className="input" />
            </div>
            <div>
              <label className="label">Lebar kertas</label>
              <select name="paperWidth" defaultValue={receipt.paperWidth} className="input">
                <option value="58">58 mm (32 karakter)</option>
                <option value="80">80 mm (48 karakter)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Pesan di bawah struk</label>
              <input name="footer" defaultValue={receipt.footer} className="input" />
            </div>
            <button className="btn col-span-2">Simpan pengaturan struk</button>
          </form>
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
              <input name="name" className="input" required placeholder="mis. Rekening Mandiri" />
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
