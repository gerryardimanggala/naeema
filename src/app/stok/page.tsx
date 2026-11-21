import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { LOCATION_TYPES, STOCK_MOVE_TYPES } from "@/lib/constants";
import { stockAdjustAction, stockInAction, stockTransferAction } from "../actions";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";

export default async function StokPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const admin = isAdmin(user);
  const tab = str(sp.tab) || "ringkas";
  const recent = new Date();
  recent.setDate(recent.getDate() - 30);
  const [locations, variants] = await Promise.all([
    db.location.findMany({
      where: { active: true, OR: [{ type: { not: "EVENT" } }, { event: { endDate: { gte: recent } } }, { stocks: { some: { qty: { not: 0 } } } }] },
      include: { event: true },
      orderBy: [{ type: "asc" }, { id: "asc" }],
    }),
    db.variant.findMany({ where: { active: true }, include: { product: true, stocks: true }, orderBy: [{ product: { name: "asc" } }, { sku: "asc" }] }),
  ]);
  const tabs: [string, string][] = [
    ["ringkas", "Stok per lokasi"],
    ...(admin ? ([["masuk", "Barang masuk"]] as [string, string][]) : []),
    ["pindah", "Pindah lokasi"],
    ...(admin ? ([["opname", "Stock opname"]] as [string, string][]) : []),
    ["riwayat", "Riwayat"],
  ];
  const qtyAt = (v: (typeof variants)[number], locId: number) => v.stocks.find((s) => s.locationId === locId)?.qty ?? 0;

  const variantInputs = (showLoc?: number) => (
    <div className="max-h-[480px] overflow-y-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Produk</th>
            {showLoc && <th className="num">Stok asal</th>}
            <th className="num w-28">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id}>
              <td>
                {v.product.name} <span className="text-neutral-500">{[v.color, v.size].filter(Boolean).join(" / ")}</span>
                <div className="text-xs text-neutral-500">{v.sku}</div>
              </td>
              {showLoc && <td className="num">{qtyAt(v, showLoc)}</td>}
              <td>
                <input type="number" min={0} name={`qty_${v.id}`} className="input text-right" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  let moves: Awaited<ReturnType<typeof loadMoves>> = [];
  if (tab === "riwayat") moves = await loadMoves();

  return (
    <div>
      <PageHeader title="Stok" desc="Stok per gudang, toko, dan booth pameran." />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/stok?tab=${k}`} className={tab === k ? "btn" : "btn-secondary"}>
            {l}
          </Link>
        ))}
      </div>

      {tab === "ringkas" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Produk</th>
                  {locations.map((l) => (
                    <th key={l.id} className="num">
                      {l.name}
                      <div className="font-normal">{LOCATION_TYPES[l.type]}</div>
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const total = v.stocks.reduce((s, x) => s + x.qty, 0);
                  return (
                    <tr key={v.id}>
                      <td>
                        {v.product.name} <span className="text-neutral-500">{[v.color, v.size].filter(Boolean).join(" / ")}</span>
                        <div className="text-xs text-neutral-500">{v.sku}</div>
                      </td>
                      {locations.map((l) => {
                        const q = qtyAt(v, l.id);
                        return (
                          <td key={l.id} className={`num ${q < 0 ? "font-semibold text-red-700" : q === 0 ? "text-neutral-300" : ""}`}>
                            {q}
                          </td>
                        );
                      })}
                      <td className={`num font-medium ${total <= 5 ? "text-amber-700" : ""}`}>{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-neutral-500">Angka merah = stok minus (terjual melebihi catatan stok). Cek dan lakukan stock opname.</p>
        </Card>
      )}

      {tab === "masuk" && admin && (
        <Card title="Catat barang masuk (produksi / restock)">
          <form action={stockInAction} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Masuk ke</label>
                <select name="locationId" className="input">
                  {locations.filter((l) => l.type !== "EVENT").map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Catatan</label>
                <input name="note" className="input" placeholder="mis. produksi batch Desember" />
              </div>
            </div>
            {variantInputs()}
            <button className="btn">Simpan barang masuk</button>
          </form>
        </Card>
      )}

      {tab === "pindah" && (
        <Card title="Pindah stok antar lokasi (mis. gudang → booth pameran)">
          <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="pindah" />
            <div>
              <label className="label">Lihat stok asal di</label>
              <select name="from" defaultValue={str(sp.from)} className="input">
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <button className="btn-secondary">Ganti</button>
          </form>
          {(() => {
            const fromId = Number(str(sp.from)) || locations[0]?.id;
            return (
              <form action={stockTransferAction} className="space-y-3">
                <input type="hidden" name="fromLocationId" value={fromId} />
                <input type="hidden" name="back" value={`/stok?tab=pindah&from=${fromId}`} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label">Dari</label>
                    <div className="input bg-neutral-50">{locations.find((l) => l.id === fromId)?.name}</div>
                  </div>
                  <div>
                    <label className="label">Ke</label>
                    <select name="toLocationId" className="input">
                      {locations.filter((l) => l.id !== fromId).map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Catatan</label>
                    <input name="note" className="input" />
                  </div>
                </div>
                {variantInputs(fromId)}
                <button className="btn">Pindahkan</button>
              </form>
            );
          })()}
        </Card>
      )}

      {tab === "opname" && admin && (
        <Card title="Stock opname: isi jumlah fisik, sistem mencatat selisihnya">
          <form action={stockAdjustAction} className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="label">Lokasi</label>
              <select name="locationId" className="input">
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Produk</label>
              <select name="variantId" className="input">
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.sku} · {v.product.name} {[v.color, v.size].filter(Boolean).join(" / ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Jumlah fisik</label>
              <input name="countedQty" type="number" min={0} className="input" required />
            </div>
            <div className="sm:col-span-3">
              <label className="label">Catatan</label>
              <input name="note" className="input" placeholder="mis. opname akhir bulan" />
            </div>
            <div className="flex items-end">
              <button className="btn w-full">Simpan</button>
            </div>
          </form>
        </Card>
      )}

      {tab === "riwayat" && (
        <Card title="200 mutasi stok terakhir">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Jenis</th>
                  <th>Produk</th>
                  <th>Dari → ke</th>
                  <th className="num">Qty</th>
                  <th>Oleh</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{m.createdAt.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td>
                      {STOCK_MOVE_TYPES[m.type]}
                      {m.sale && (
                        <div className="text-xs">
                          <Link className="underline" href={`/penjualan/${m.sale.id}`}>{m.sale.number}</Link>
                        </div>
                      )}
                    </td>
                    <td>{m.variant.sku}</td>
                    <td className="text-xs">
                      {m.fromLocation?.name ?? "-"} → {m.toLocation?.name ?? "-"}
                    </td>
                    <td className="num">{m.qty}</td>
                    <td className="text-xs">
                      {m.user.name}
                      {m.note && <div className="text-neutral-500">{m.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function loadMoves() {
  return db.stockMove.findMany({
    include: { variant: true, fromLocation: true, toLocation: true, user: true, sale: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
