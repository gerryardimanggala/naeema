import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fromMinor } from "@/lib/money";
import { saveProduct, saveVariant } from "../../actions";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n";
import type { T } from "@/lib/i18n-core";

type V = { id: number; sku: string; color: string | null; size: string | null; priceIdr: number; active: boolean; prices: { currency: string; price: number }[] } | null;

function VariantRow({ productId, v, t }: { productId: number; v: V; t: T }) {
  const p = (cur: string) => {
    const x = v?.prices.find((y) => y.currency === cur);
    return x ? fromMinor(x.price, cur) : "";
  };
  return (
    <form action={saveVariant} className="grid grid-cols-2 items-end gap-2 border-b border-neutral-100 py-2 sm:grid-cols-8">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="id" value={v?.id ?? ""} />
      <div className="sm:col-span-2">
        <label className="label">{t("SKU")}</label>
        <input name="sku" defaultValue={v?.sku} className="input" required />
      </div>
      <div>
        <label className="label">{t("Warna")}</label>
        <input name="color" defaultValue={v?.color ?? ""} className="input" />
      </div>
      <div>
        <label className="label">{t("Ukuran")}</label>
        <input name="size" defaultValue={v?.size ?? ""} className="input" />
      </div>
      <div>
        <label className="label">{t("IDR")}</label>
        <input name="priceIdr" defaultValue={v?.priceIdr ?? ""} className="input" required />
      </div>
      <div>
        <label className="label">{t("MYR")}</label>
        <input name="priceMYR" defaultValue={p("MYR")} className="input" />
      </div>
      <div>
        <label className="label">{t("SGD")}</label>
        <input name="priceSGD" defaultValue={p("SGD")} className="input" />
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="active" defaultChecked={v?.active ?? true} /> {t("aktif")}
        </label>
        <button className="btn px-3 py-1.5">{v ? t("Simpan") : t("Tambah")}</button>
      </div>
    </form>
  );
}

export default async function ProductDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const t = await getT();
  const me = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const product = await db.product.findFirst({
    where: { id: Number(id) || 0, businessId: me.businessId },
    include: { variants: { include: { prices: true }, orderBy: { sku: "asc" } } },
  });
  if (!product) notFound();
  // Kategori nonaktif tetap ditampilkan kalau sedang dipakai produk ini.
  const categories = await db.category.findMany({
    where: { businessId: me.businessId, OR: [{ active: true }, { id: product.categoryId }] },
    orderBy: { name: "asc" },
  });
  return (
    <div>
      <PageHeader title={product.name}>
        <Link href="/produk" className="btn-secondary">{t("Kembali")}</Link>
      </PageHeader>
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      <Card title={t("Data produk")} className="mb-4">
        <form action={saveProduct} className="grid items-end gap-3 sm:grid-cols-4">
          <input type="hidden" name="id" value={product.id} />
          <div className="sm:col-span-2">
            <label className="label">{t("Nama")}</label>
            <input name="name" defaultValue={product.name} className="input" />
          </div>
          <div>
            <label className="label">{t("Kategori")}</label>
            <select name="categoryId" defaultValue={product.categoryId} className="input">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="active" defaultChecked={product.active} /> {t("aktif")}
            </label>
            <button className="btn">{t("Simpan")}</button>
          </div>
        </form>
      </Card>
      <Card title={t("Varian & harga")}>
        {product.variants.map((v) => (
          <VariantRow key={v.id} productId={product.id} v={v} t={t} />
        ))}
        <div className="mt-3 text-xs font-medium text-neutral-500">{t("Tambah varian")}</div>
        <VariantRow productId={product.id} v={null} t={t} />
      </Card>
    </div>
  );
}
