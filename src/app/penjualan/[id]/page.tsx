import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { formatMoney, formatRate } from "@/lib/money";
import { CHANNELS, MARKETPLACES, PAYMENT_METHODS } from "@/lib/constants";
import { voidSaleAction } from "../../actions";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";

export default async function SaleDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const sale = await db.sale.findUnique({
    where: { id: Number(id) },
    include: { items: { include: { variant: { include: { product: true } } } }, payments: { include: { wallet: true } }, event: true, location: true, cashier: true },
  });
  if (!sale || (!isAdmin(user) && sale.cashierId !== user.id)) notFound();
  return (
    <div className="max-w-2xl">
      <PageHeader title={`Nota ${sale.number}`} desc={sale.date.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })}>
        <Link href="/penjualan" className="btn-secondary">Kembali</Link>
      </PageHeader>
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      {sale.status === "VOID" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Dibatalkan: {sale.voidReason}</div>
      )}
      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-neutral-500">Sumber</dt>
          <dd>
            {CHANNELS[sale.channel]}
            {sale.marketplace && ` · ${MARKETPLACES[sale.marketplace]}`}
            {sale.externalRef && ` · ${sale.externalRef}`}
          </dd>
          {sale.event && (
            <>
              <dt className="text-neutral-500">Event</dt>
              <dd>
                <Link className="underline" href={`/event/${sale.event.id}`}>{sale.event.name}</Link>
              </dd>
            </>
          )}
          <dt className="text-neutral-500">Stok dari</dt>
          <dd>{sale.location.name}</dd>
          <dt className="text-neutral-500">Kasir</dt>
          <dd>{sale.cashier.name}</dd>
          <dt className="text-neutral-500">Kurs</dt>
          <dd>{sale.currency === "IDR" ? "-" : `1 ${sale.currency} = Rp ${formatRate(sale.rateToIdr)}`}</dd>
        </dl>
      </Card>
      <Card className="mb-4">
        <table className="tbl">
          <thead>
            <tr>
              <th>Barang</th>
              <th className="num">Qty</th>
              <th className="num">Harga</th>
              <th className="num">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.variant.product.name} <span className="text-neutral-500">{[i.variant.color, i.variant.size].filter(Boolean).join(" / ")}</span>
                  <div className="text-xs text-neutral-500">{i.variant.sku}</div>
                </td>
                <td className="num">{i.qty}</td>
                <td className="num">{formatMoney(i.price, sale.currency)}</td>
                <td className="num">{formatMoney(i.qty * i.price, sale.currency)}</td>
              </tr>
            ))}
            {sale.discount > 0 && (
              <tr>
                <td colSpan={3}>Diskon</td>
                <td className="num">−{formatMoney(sale.discount, sale.currency)}</td>
              </tr>
            )}
            <tr className="font-semibold">
              <td colSpan={3}>Total</td>
              <td className="num">
                {formatMoney(sale.total, sale.currency)}
                {sale.currency !== "IDR" && <div className="text-xs font-normal text-neutral-500">≈ {formatMoney(sale.totalIdr, "IDR")}</div>}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
      <Card title="Pembayaran" className="mb-4">
        {sale.payments.map((p) => (
          <div key={p.id} className="flex justify-between text-sm">
            <span>
              {PAYMENT_METHODS[p.method]} → <b>{p.wallet.name}</b>
            </span>
            <span className="tabular-nums">{formatMoney(p.amount, sale.currency)}</span>
          </div>
        ))}
        {sale.note && <p className="mt-2 text-sm text-neutral-600">Catatan: {sale.note}</p>}
      </Card>
      {isAdmin(user) && sale.status === "PAID" && (
        <Card title="Batalkan penjualan">
          <form action={voidSaleAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={sale.id} />
            <input name="reason" className="input flex-1" placeholder="Alasan pembatalan" required />
            <button className="btn-danger">Batalkan & kembalikan stok</button>
          </form>
        </Card>
      )}
    </div>
  );
}
