import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { createProduct } from "../actions";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";

export default async function ProdukPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await requireAdmin();
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { businessId: me.businessId },
      include: { category: true, variants: { include: { prices: true, stocks: true } } },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    }),
    db.category.findMany({ where: { businessId: me.businessId, active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Produk" desc="Produk, varian warna/ukuran, dan harga per mata uang." />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      <Card title="Tambah produk" className="mb-4">
        <form action={createProduct} className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label">Nama produk</label>
            <input name="name" className="input" required placeholder="mis. Pashmina Ceruty" />
          </div>
          <div>
            <label className="label">Kategori</label>
            <select name="categoryId" className="input" required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!categories.length && (
              <p className="mt-1 text-xs text-red-700">
                Belum ada kategori. <Link href="/pengaturan#kategori" className="underline">Tambah di Pengaturan</Link>.
              </p>
            )}
          </div>
          <div>
            <label className="label">Kode SKU dasar</label>
            <input name="skuBase" className="input" required placeholder="mis. PSC" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Warna (pisahkan dengan koma)</label>
            <input name="colors" className="input" placeholder="Hitam, Mocca, Dusty Pink" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Ukuran (opsional, pisahkan dengan koma)</label>
            <input name="sizes" className="input" placeholder="S, M, L" />
          </div>
          <div>
            <label className="label">Harga IDR</label>
            <input name="priceIdr" inputMode="decimal" className="input" required />
          </div>
          <div>
            <label className="label">Harga MYR (opsional)</label>
            <input name="priceMyr" inputMode="decimal" className="input" />
          </div>
          <div>
            <label className="label">Harga SGD (opsional)</label>
            <input name="priceSgd" inputMode="decimal" className="input" />
          </div>
          <div className="flex items-end">
            <button className="btn w-full">Tambah</button>
          </div>
        </form>
        <p className="mt-2 text-xs text-neutral-500">Satu varian dibuat untuk setiap kombinasi warna dan ukuran. Stok awal diisi lewat menu Stok → Barang masuk.</p>
      </Card>
      <Card>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Produk</th>
                <th>Kategori</th>
                <th>Varian</th>
                <th className="num">IDR</th>
                <th className="num">MYR</th>
                <th className="num">SGD</th>
                <th className="num">Total stok</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const v0 = p.variants[0];
                const price = (cur: string) => v0?.prices.find((x) => x.currency === cur);
                return (
                  <tr key={p.id} className={p.active ? "" : "text-neutral-400"}>
                    <td>
                      <Link href={`/produk/${p.id}`} className="font-medium underline">{p.name}</Link>
                    </td>
                    <td>{p.category.name}</td>
                    <td className="text-xs">{p.variants.map((v) => [v.color, v.size].filter(Boolean).join(" ") || v.sku).join(", ")}</td>
                    <td className="num">{v0 ? formatMoney(v0.priceIdr, "IDR") : "-"}</td>
                    <td className="num">{price("MYR") ? formatMoney(price("MYR")!.price, "MYR") : "-"}</td>
                    <td className="num">{price("SGD") ? formatMoney(price("SGD")!.price, "SGD") : "-"}</td>
                    <td className="num">{p.variants.reduce((s, v) => s + v.stocks.reduce((a, b) => a + b.qty, 0), 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
