import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { cashPosition } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { CHANNELS, WALLET_KINDS } from "@/lib/constants";
import { Card, Flash, PageHeader, Stat, str, type SP } from "@/components/ui";
import { jakartaDay, startOfDay } from "@/lib/time";
import { getT } from "@/lib/i18n";

export default async function Home({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await requireUser();
  const bid = user.businessId;
  const admin = isAdmin(user);
  const todayStr = jakartaDay();
  const today = startOfDay(todayStr);
  const monthStart = startOfDay(todayStr.slice(0, 8) + "01");

  const [todaySales, monthByChannel, pending, position] = await Promise.all([
    db.sale.aggregate({ _sum: { totalIdr: true }, _count: true, where: { businessId: bid, status: "PAID", date: { gte: today }, ...(admin ? {} : { cashierId: user.id }) } }),
    db.sale.groupBy({ by: ["channel"], _sum: { totalIdr: true }, where: { businessId: bid, status: "PAID", date: { gte: monthStart } } }),
    db.cashMove.count({ where: { businessId: bid, status: "PENDING", ...(admin ? {} : { toWallet: { ownerId: user.id } }) } }),
    cashPosition(bid, admin ? {} : { ownerId: user.id }),
  ]);
  const monthTotal = monthByChannel.reduce((s, c) => s + (c._sum.totalIdr ?? 0), 0);
  const personHeld = position.holders.filter((h) => h.kind === "PERSON").reduce((s, h) => s + h.totalIdr, 0);

  return (
    <div>
      <PageHeader title={t("Halo, {name}", { name: user.name })} desc={t("Ringkasan hari ini dan posisi uang.")}>
        <Link href="/kasir" className="btn">
          {t("+ Penjualan baru")}
        </Link>
      </PageHeader>
      <Flash ok={str(sp.ok)} error={sp.error === "akses" ? t("Halaman itu hanya untuk admin.") : str(sp.error)} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={admin ? t("Penjualan hari ini") : t("Penjualan saya hari ini")} value={formatMoney(todaySales._sum.totalIdr ?? 0, "IDR")} sub={t("{n} nota", { n: todaySales._count })} />
        {admin && <Stat label={t("Penjualan bulan ini")} value={formatMoney(monthTotal, "IDR")} sub={monthByChannel.map((c) => `${t(CHANNELS[c.channel])}: ${formatMoney(c._sum.totalIdr ?? 0, "IDR")}`).join(" · ") || "-"} />}
        <Stat label={admin ? t("Uang dipegang orang") : t("Uang yang saya pegang")} value={formatMoney(personHeld, "IDR")} sub={t("setara rupiah, kurs terbaru")} />
        <Stat label={t("Setoran menunggu konfirmasi")} value={pending} sub={pending ? <Link href="/kas" className="underline">{t("Buka halaman kas")}</Link> : t("Tidak ada")} />
      </div>

      <Card title={admin ? t("Posisi uang per orang / rekening") : t("Uang yang saya pegang")}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Pemegang")}</th>
                <th>{t("Dompet")}</th>
                <th className="num">{t("Saldo")}</th>
                <th className="num">{t("Setara IDR")}</th>
                <th className="num">{t("Setoran belum dikonfirmasi")}</th>
              </tr>
            </thead>
            <tbody>
              {position.holders.map((h) =>
                h.rows.map((r, i) => (
                  <tr key={r.wallet.id}>
                    {i === 0 && (
                      <td rowSpan={h.rows.length} className="font-medium">
                        {h.label}
                        <div className="text-xs font-normal text-neutral-500">{t(WALLET_KINDS[h.kind])}</div>
                        {h.rows.length > 1 && <div className="text-xs font-normal text-neutral-500">{t("Total ≈ {amount}", { amount: formatMoney(h.totalIdr, "IDR") })}</div>}
                      </td>
                    )}
                    <td>{r.wallet.name}</td>
                    <td className={`num font-medium ${r.balance < 0 ? "text-red-700" : ""}`}>{formatMoney(r.balance, r.wallet.currency)}</td>
                    <td className="num text-neutral-500">{r.wallet.currency === "IDR" ? "" : formatMoney(r.balanceIdr, "IDR")}</td>
                    <td className="num text-amber-700">{r.pendingOut ? formatMoney(r.pendingOut, r.wallet.currency) : ""}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          {t("Saldo = uang diterima dari penjualan + uang masuk − pengeluaran − setoran yang sudah dikonfirmasi.")}
        </p>
      </Card>
    </div>
  );
}
