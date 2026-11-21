import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { cashPosition } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { CHANNELS, WALLET_KINDS } from "@/lib/constants";
import { Card, Flash, PageHeader, Stat, str, type SP } from "@/components/ui";

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const admin = isAdmin(user);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todaySales, monthByChannel, pending, position] = await Promise.all([
    db.sale.aggregate({ _sum: { totalIdr: true }, _count: true, where: { status: "PAID", date: { gte: today }, ...(admin ? {} : { cashierId: user.id }) } }),
    db.sale.groupBy({ by: ["channel"], _sum: { totalIdr: true }, where: { status: "PAID", date: { gte: monthStart } } }),
    db.cashMove.count({ where: { status: "PENDING", ...(admin ? {} : { toWallet: { ownerId: user.id } }) } }),
    cashPosition(admin ? {} : { ownerId: user.id }),
  ]);
  const monthTotal = monthByChannel.reduce((s, c) => s + (c._sum.totalIdr ?? 0), 0);
  const personHeld = position.holders.filter((h) => h.kind === "PERSON").reduce((s, h) => s + h.totalIdr, 0);

  return (
    <div>
      <PageHeader title={`Halo, ${user.name}`} desc="Ringkasan hari ini dan posisi uang.">
        <Link href="/kasir" className="btn">
          + Penjualan baru
        </Link>
      </PageHeader>
      <Flash ok={str(sp.ok)} error={sp.error === "akses" ? "Halaman itu hanya untuk admin." : str(sp.error)} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={admin ? "Penjualan hari ini" : "Penjualan saya hari ini"} value={formatMoney(todaySales._sum.totalIdr ?? 0, "IDR")} sub={`${todaySales._count} nota`} />
        {admin && <Stat label="Penjualan bulan ini" value={formatMoney(monthTotal, "IDR")} sub={monthByChannel.map((c) => `${CHANNELS[c.channel]}: ${formatMoney(c._sum.totalIdr ?? 0, "IDR")}`).join(" · ") || "-"} />}
        <Stat label={admin ? "Uang dipegang orang" : "Uang yang saya pegang"} value={formatMoney(personHeld, "IDR")} sub="setara rupiah, kurs terbaru" />
        <Stat label="Setoran menunggu konfirmasi" value={pending} sub={pending ? <Link href="/kas" className="underline">Buka halaman kas</Link> : "Tidak ada"} />
      </div>

      <Card title={admin ? "Posisi uang per orang / rekening" : "Uang yang saya pegang"}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pemegang</th>
                <th>Dompet</th>
                <th className="num">Saldo</th>
                <th className="num">Setara IDR</th>
                <th className="num">Setoran belum dikonfirmasi</th>
              </tr>
            </thead>
            <tbody>
              {position.holders.map((h) =>
                h.rows.map((r, i) => (
                  <tr key={r.wallet.id}>
                    {i === 0 && (
                      <td rowSpan={h.rows.length} className="font-medium">
                        {h.label}
                        <div className="text-xs font-normal text-neutral-500">{WALLET_KINDS[h.kind]}</div>
                        {h.rows.length > 1 && <div className="text-xs font-normal text-neutral-500">Total ≈ {formatMoney(h.totalIdr, "IDR")}</div>}
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
          Saldo = uang diterima dari penjualan + uang masuk − pengeluaran − setoran yang sudah dikonfirmasi.
        </p>
      </Card>
    </div>
  );
}
