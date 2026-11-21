import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { cashPosition } from "@/lib/reports";
import { fmtDate, jakartaDay } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { CASH_MOVE_TYPES, EXPENSE_CATEGORIES } from "@/lib/constants";
import { cashMoveAction, decideCashMoveAction } from "../actions";
import { Card, Empty, Flash, PageHeader, str, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n";

type W = { id: number; name: string; currency: string };

function WalletSelect({ name, wallets, label }: { name: string; wallets: W[]; label: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select name={name} className="input" required>
        {wallets.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} ({w.currency})
          </option>
        ))}
      </select>
    </div>
  );
}

const STATUS: Record<string, string> = { PENDING: "Menunggu", CONFIRMED: "Dikonfirmasi", REJECTED: "Ditolak" };

export default async function KasPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await requireUser();
  const bid = user.businessId;
  const admin = isAdmin(user);
  const [wallets, position, pending, history] = await Promise.all([
    db.wallet.findMany({ where: { businessId: bid, active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    cashPosition(bid, admin ? {} : { ownerId: user.id }),
    db.cashMove.findMany({
      where: { businessId: bid, status: "PENDING", ...(admin ? {} : { OR: [{ toWallet: { ownerId: user.id } }, { createdById: user.id }] }) },
      include: { fromWallet: true, toWallet: true, createdBy: true },
      orderBy: { date: "asc" },
    }),
    db.cashMove.findMany({
      where: admin ? { businessId: bid } : { businessId: bid, OR: [{ fromWallet: { ownerId: user.id } }, { toWallet: { ownerId: user.id } }, { createdById: user.id }] },
      include: { fromWallet: true, toWallet: true, createdBy: true, confirmedBy: true, event: true },
      orderBy: { date: "desc" },
      take: 100,
    }),
  ]);
  const mine = admin ? wallets : wallets.filter((w) => w.ownerId === user.id);
  const today = jakartaDay();

  return (
    <div>
      <PageHeader title={t("Kas")} desc={t("Uang yang dipegang tiap orang, setoran, dan pengeluaran.")} />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />

      {pending.length > 0 && (
        <Card title={t("Menunggu konfirmasi ({n})", { n: pending.length })} className="mb-4 border-amber-300">
          <div className="overflow-x-auto">
            <table className="tbl">
              <tbody>
                {pending.map((m) => {
                  const canDecide = (admin || m.toWallet?.ownerId === user.id) && (m.createdById !== user.id || user.role === "OWNER");
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{fmtDate(m.date)}</td>
                      <td>
                        {t(CASH_MOVE_TYPES[m.type])}: <b>{m.fromWallet?.name}</b> → <b>{m.toWallet?.name}</b>
                        <div className="text-xs text-neutral-500">
                          {t("oleh {name}", { name: m.createdBy.name })}
                          {m.note && ` · ${m.note}`}
                        </div>
                      </td>
                      <td className="num">
                        {formatMoney(m.amount, m.fromWallet!.currency)}
                        {m.toAmount != null && <div className="text-xs text-neutral-500">{t("diterima {amount}", { amount: formatMoney(m.toAmount, m.toWallet!.currency) })}</div>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {canDecide ? (
                          <div className="flex justify-end gap-2">
                            <form action={decideCashMoveAction}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="decision" value="approve" />
                              <button className="btn px-3 py-1.5">{t("Uang sudah diterima")}</button>
                            </form>
                            <form action={decideCashMoveAction}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="decision" value="reject" />
                              <button className="btn-danger">{t("Tolak")}</button>
                            </form>
                          </div>
                        ) : (
                          <span className="badge">{t("menunggu penerima")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title={admin ? t("Posisi uang") : t("Uang yang saya pegang")} className="mb-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {position.rows
            .filter((r) => r.wallet.active || r.balance !== 0)
            .map((r) => (
              <div key={r.wallet.id} className="rounded-lg border border-neutral-200 p-3">
                <div className="text-xs text-neutral-500">{r.wallet.name}</div>
                <div className={`text-lg font-semibold tabular-nums ${r.balance < 0 ? "text-red-700" : ""}`}>{formatMoney(r.balance, r.wallet.currency)}</div>
                <div className="text-xs text-neutral-500">
                  {t("terima {in} · keluar {out}", { in: formatMoney(r.received + r.moneyIn, r.wallet.currency), out: formatMoney(r.moneyOut, r.wallet.currency) })}
                  {r.pendingOut > 0 && <span className="text-amber-700"> · {t("menunggu {amount}", { amount: formatMoney(r.pendingOut, r.wallet.currency) })}</span>}
                </div>
              </div>
            ))}
        </div>
      </Card>

      {mine.length > 0 && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card title={t("Setor uang")}>
            <form action={cashMoveAction} className="grid grid-cols-2 gap-3">
              <input type="hidden" name="type" value="DEPOSIT" />
              <WalletSelect name="fromWalletId" wallets={mine} label={t("Dari")} />
              <WalletSelect name="toWalletId" wallets={wallets.filter((w) => w.kind !== "PERSON" || w.ownerId !== user.id)} label={t("Ke")} />
              <div>
                <label className="label">{t("Jumlah (mata uang asal)")}</label>
                <input name="amount" inputMode="decimal" className="input" required />
              </div>
              <div>
                <label className="label">{t("Jumlah diterima (jika beda mata uang)")}</label>
                <input name="toAmount" inputMode="decimal" className="input" placeholder={t("mis. hasil tukar ke rupiah")} />
              </div>
              <div>
                <label className="label">{t("Tanggal")}</label>
                <input type="date" name="date" defaultValue={today} className="input" />
              </div>
              <div>
                <label className="label">{t("Catatan / no. bukti transfer")}</label>
                <input name="note" className="input" />
              </div>
              <button className="btn col-span-2">{t("Catat setoran")}</button>
              <p className="col-span-2 text-xs text-neutral-500">{t("Saldo baru berkurang setelah penerima atau admin menekan konfirmasi.")}</p>
            </form>
          </Card>

          <Card title={t("Catat pengeluaran")}>
            <p className="mb-3 text-sm text-neutral-600">
              {t("Biaya operasional (sewa, gaji, listrik, iklan, packing) dan biaya event sekarang dicatat di halaman Pengeluaran, lengkap dengan total per bulan dan per kategori.")}
            </p>
            <Link href="/pengeluaran" className="btn">
              {t("Buka Pengeluaran")}
            </Link>
          </Card>

          <Card title={t("Tukar valas / pindah dompet")}>
            <form action={cashMoveAction} className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">{t("Jenis")}</label>
                <select name="type" className="input">
                  <option value="EXCHANGE">{t("Tukar valas (mis. MYR ke IDR)")}</option>
                  <option value="TRANSFER">{t("Serahkan uang ke orang lain")}</option>
                </select>
              </div>
              <WalletSelect name="fromWalletId" wallets={mine} label={t("Dari")} />
              <WalletSelect name="toWalletId" wallets={wallets} label={t("Ke")} />
              <div>
                <label className="label">{t("Jumlah keluar")}</label>
                <input name="amount" inputMode="decimal" className="input" required />
              </div>
              <div>
                <label className="label">{t("Jumlah diterima (jika beda mata uang)")}</label>
                <input name="toAmount" inputMode="decimal" className="input" />
              </div>
              <input type="hidden" name="date" value={today} />
              <div className="col-span-2">
                <label className="label">{t("Catatan")}</label>
                <input name="note" className="input" placeholder={t("mis. money changer, kurs 3.580")} />
              </div>
              <button className="btn col-span-2">{t("Catat")}</button>
              <p className="col-span-2 text-xs text-neutral-500">{t("Tukar valas antar dompet sendiri langsung berlaku. Menyerahkan uang ke orang lain menunggu konfirmasi penerima.")}</p>
            </form>
          </Card>

          {admin && (
            <Card title={t("Koreksi saldo (admin)")}>
              <form action={cashMoveAction} className="grid grid-cols-2 gap-3">
                <input type="hidden" name="type" value="ADJUST" />
                <WalletSelect name="fromWalletId" wallets={wallets} label={t("Dompet")} />
                <div>
                  <label className="label">{t("Jumlah (+ tambah, − kurang)")}</label>
                  <input name="amount" inputMode="decimal" className="input" placeholder={t("mis. -50000")} required />
                </div>
                <div className="col-span-2">
                  <label className="label">{t("Alasan")}</label>
                  <input name="note" className="input" required placeholder={t("mis. saldo awal, selisih hitung fisik")} />
                </div>
                <button className="btn col-span-2">{t("Simpan koreksi")}</button>
              </form>
            </Card>
          )}
        </div>
      )}

      <Card title={t("Riwayat mutasi kas")}>
        {history.length === 0 ? (
          <Empty>{t("Belum ada mutasi kas.")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("Tanggal")}</th>
                  <th>{t("Jenis")}</th>
                  <th>{t("Dari → ke")}</th>
                  <th className="num">{t("Jumlah")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Catatan")}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((m) => {
                  const cur = (m.fromWallet ?? m.toWallet)!.currency;
                  return (
                    <tr key={m.id} className={m.status === "REJECTED" ? "text-neutral-400" : ""}>
                      <td className="whitespace-nowrap">{fmtDate(m.date)}</td>
                      <td>
                        {t(CASH_MOVE_TYPES[m.type])}
                        {m.category && <div className="text-xs text-neutral-500">{t(EXPENSE_CATEGORIES[m.category])}</div>}
                      </td>
                      <td className="text-xs">
                        {m.fromWallet?.name ?? "-"} → {m.toWallet?.name ?? (m.type === "EXPENSE" ? t("pengeluaran") : "-")}
                        {m.event && <div className="text-neutral-500">{m.event.name}</div>}
                      </td>
                      <td className="num">
                        {formatMoney(m.amount, cur)}
                        {m.toAmount != null && <div className="text-xs text-neutral-500">→ {formatMoney(m.toAmount, m.toWallet!.currency)}</div>}
                      </td>
                      <td className="text-xs">
                        {t(STATUS[m.status])}
                        {m.confirmedBy && m.status !== "PENDING" && <div className="text-neutral-500">{m.confirmedBy.name}</div>}
                      </td>
                      <td className="text-xs text-neutral-600">
                        {m.note}
                        <div className="text-neutral-400">{t("dicatat {name}", { name: m.createdBy.name })}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
