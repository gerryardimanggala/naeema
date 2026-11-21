import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { formatMoney, formatRate } from "@/lib/money";
import { CHANNELS, MARKETPLACES, PAYMENT_METHODS } from "@/lib/constants";
import { voidSaleAction } from "../../actions";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";
import { fmtDateTime } from "@/lib/time";
import { getLang, getT } from "@/lib/i18n";
import { locale } from "@/lib/i18n-core";

export default async function SaleDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const t = await getT();
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const sale = await db.sale.findFirst({
    where: { id: Number(id) || 0, businessId: user.businessId },
    include: { items: { include: { variant: { include: { product: true } } } }, payments: { include: { wallet: true } }, event: true, location: true, cashier: true },
  });
  if (!sale || (!isAdmin(user) && sale.cashierId !== user.id)) notFound();
  return (
    <div className="max-w-2xl">
      <PageHeader title={t("Nota {number}", { number: sale.number })} desc={fmtDateTime(sale.date, "full", locale(await getLang())) + " WIB"}>
        <Link href={`/penjualan/${sale.id}/struk`} className="btn">{t("Cetak struk")}</Link>
        <Link href="/penjualan" className="btn-secondary">{t("Kembali")}</Link>
      </PageHeader>
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      {sale.status === "VOID" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{t("Dibatalkan: {reason}", { reason: sale.voidReason ?? "" })}</div>
      )}
      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-neutral-500">{t("Sumber")}</dt>
          <dd>
            {t(CHANNELS[sale.channel])}
            {sale.marketplace && ` · ${t(MARKETPLACES[sale.marketplace])}`}
            {sale.externalRef && ` · ${sale.externalRef}`}
          </dd>
          {sale.event && (
            <>
              <dt className="text-neutral-500">{t("Pameran / event")}</dt>
              <dd>
                <Link className="underline" href={`/event/${sale.event.id}`}>{sale.event.name}</Link>
              </dd>
            </>
          )}
          <dt className="text-neutral-500">{t("Stok dari")}</dt>
          <dd>{sale.location.name}</dd>
          <dt className="text-neutral-500">{t("Kasir")}</dt>
          <dd>{sale.cashier.name}</dd>
          <dt className="text-neutral-500">{t("Kurs")}</dt>
          <dd>{sale.currency === "IDR" ? "-" : `1 ${sale.currency} = Rp ${formatRate(sale.rateToIdr)}`}</dd>
        </dl>
      </Card>
      <Card className="mb-4">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("Barang")}</th>
              <th className="num">{t("Qty")}</th>
              <th className="num">{t("Harga")}</th>
              <th className="num">{t("Jumlah")}</th>
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
                <td colSpan={3}>{t("Diskon")}</td>
                <td className="num">−{formatMoney(sale.discount, sale.currency)}</td>
              </tr>
            )}
            <tr className="font-semibold">
              <td colSpan={3}>{t("Total")}</td>
              <td className="num">
                {formatMoney(sale.total, sale.currency)}
                {sale.currency !== "IDR" && <div className="text-xs font-normal text-neutral-500">≈ {formatMoney(sale.totalIdr, "IDR")}</div>}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
      <Card title={t("Pembayaran")} className="mb-4">
        {sale.payments.map((p) => (
          <div key={p.id} className="flex justify-between text-sm">
            <span>
              {t(PAYMENT_METHODS[p.method])} → <b>{p.wallet.name}</b>
            </span>
            <span className="tabular-nums">{formatMoney(p.amount, sale.currency)}</span>
          </div>
        ))}
        {sale.note && <p className="mt-2 text-sm text-neutral-600">Catatan: {sale.note}</p>}
      </Card>
      {isAdmin(user) && sale.status === "PAID" && (
        <Card title={t("Batalkan penjualan")}>
          <form action={voidSaleAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={sale.id} />
            <input name="reason" className="input flex-1" placeholder={t("Alasan pembatalan")} required />
            <button className="btn-danger">{t("Batalkan & kembalikan stok")}</button>
          </form>
        </Card>
      )}
    </div>
  );
}
