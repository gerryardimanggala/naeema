import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { cashPosition } from "@/lib/reports";
import { fmtDate, jakartaDay } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { CASH_MOVE_TYPES, EXPENSE_CATEGORIES } from "@/lib/constants";
import { cashMoveAction, decideCashMoveAction } from "../actions";
import { Card, Empty, Flash, PageHeader, str, type SP } from "@/components/ui";

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
  const sp = await searchParams;
  const user = await requireUser();
  const bid = user.businessId;
  const admin = isAdmin(user);
  const [wallets, events, position, pending, history] = await Promise.all([
    db.wallet.findMany({ where: { businessId: bid, active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.event.findMany({ where: { businessId: bid }, orderBy: { startDate: "desc" }, take: 20 }),
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
      <PageHeader title="Kas" desc="Uang yang dipegang tiap orang, setoran, dan pengeluaran." />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />

      {pending.length > 0 && (
        <Card title={`Menunggu konfirmasi (${pending.length})`} className="mb-4 border-amber-300">
          <div className="overflow-x-auto">
            <table className="tbl">
              <tbody>
                {pending.map((m) => {
                  const canDecide = (admin || m.toWallet?.ownerId === user.id) && (m.createdById !== user.id || user.role === "OWNER");
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{fmtDate(m.date)}</td>
                      <td>
                        {CASH_MOVE_TYPES[m.type]}: <b>{m.fromWallet?.name}</b> → <b>{m.toWallet?.name}</b>
                        <div className="text-xs text-neutral-500">
                          oleh {m.createdBy.name}
                          {m.note && ` · ${m.note}`}
                        </div>
                      </td>
                      <td className="num">
                        {formatMoney(m.amount, m.fromWallet!.currency)}
                        {m.toAmount != null && <div className="text-xs text-neutral-500">diterima {formatMoney(m.toAmount, m.toWallet!.currency)}</div>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {canDecide ? (
                          <div className="flex justify-end gap-2">
                            <form action={decideCashMoveAction}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="decision" value="approve" />
                              <button className="btn px-3 py-1.5">Uang sudah diterima</button>
                            </form>
                            <form action={decideCashMoveAction}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="decision" value="reject" />
                              <button className="btn-danger">Tolak</button>
                            </form>
                          </div>
                        ) : (
                          <span className="badge">menunggu penerima</span>
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

      <Card title={admin ? "Posisi uang" : "Uang yang saya pegang"} className="mb-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {position.rows
            .filter((r) => r.wallet.active || r.balance !== 0)
            .map((r) => (
              <div key={r.wallet.id} className="rounded-lg border border-neutral-200 p-3">
                <div className="text-xs text-neutral-500">{r.wallet.name}</div>
                <div className={`text-lg font-semibold tabular-nums ${r.balance < 0 ? "text-red-700" : ""}`}>{formatMoney(r.balance, r.wallet.currency)}</div>
                <div className="text-xs text-neutral-500">
                  terima {formatMoney(r.received + r.moneyIn, r.wallet.currency)} · keluar {formatMoney(r.moneyOut, r.wallet.currency)}
                  {r.pendingOut > 0 && <span className="text-amber-700"> · menunggu {formatMoney(r.pendingOut, r.wallet.currency)}</span>}
                </div>
              </div>
            ))}
        </div>
      </Card>

      {mine.length > 0 && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card title="Setor uang">
            <form action={cashMoveAction} className="grid grid-cols-2 gap-3">
              <input type="hidden" name="type" value="DEPOSIT" />
              <WalletSelect name="fromWalletId" wallets={mine} label="Dari" />
              <WalletSelect name="toWalletId" wallets={wallets.filter((w) => w.kind !== "PERSON" || w.ownerId !== user.id)} label="Ke" />
              <div>
                <label className="label">Jumlah (mata uang asal)</label>
                <input name="amount" inputMode="decimal" className="input" required />
              </div>
              <div>
                <label className="label">Jumlah diterima (jika beda mata uang)</label>
                <input name="toAmount" inputMode="decimal" className="input" placeholder="mis. hasil tukar ke rupiah" />
              </div>
              <div>
                <label className="label">Tanggal</label>
                <input type="date" name="date" defaultValue={today} className="input" />
              </div>
              <div>
                <label className="label">Catatan / no. bukti transfer</label>
                <input name="note" className="input" />
              </div>
              <button className="btn col-span-2">Catat setoran</button>
              <p className="col-span-2 text-xs text-neutral-500">Saldo baru berkurang setelah penerima atau admin menekan konfirmasi.</p>
            </form>
          </Card>

          <Card title="Catat pengeluaran">
            <form action={cashMoveAction} className="grid grid-cols-2 gap-3">
              <input type="hidden" name="type" value="EXPENSE" />
              <WalletSelect name="fromWalletId" wallets={mine} label="Dibayar dari" />
              <div>
                <label className="label">Jumlah</label>
                <input name="amount" inputMode="decimal" className="input" required />
              </div>
              <div>
                <label className="label">Kategori</label>
                <select name="category" className="input">
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Event (opsional)</label>
                <select name="eventId" className="input">
                  <option value="">-</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Tanggal</label>
                <input type="date" name="date" defaultValue={today} className="input" />
              </div>
              <div>
                <label className="label">Keterangan</label>
                <input name="note" className="input" required />
              </div>
              <button className="btn col-span-2">Catat pengeluaran</button>
            </form>
          </Card>

          <Card title="Tukar valas / pindah dompet">
            <form action={cashMoveAction} className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Jenis</label>
                <select name="type" className="input">
                  <option value="EXCHANGE">Tukar valas (mis. MYR ke IDR)</option>
                  <option value="TRANSFER">Serahkan uang ke orang lain</option>
                </select>
              </div>
              <WalletSelect name="fromWalletId" wallets={mine} label="Dari" />
              <WalletSelect name="toWalletId" wallets={wallets} label="Ke" />
              <div>
                <label className="label">Jumlah keluar</label>
                <input name="amount" inputMode="decimal" className="input" required />
              </div>
              <div>
                <label className="label">Jumlah diterima (jika beda mata uang)</label>
                <input name="toAmount" inputMode="decimal" className="input" />
              </div>
              <input type="hidden" name="date" value={today} />
              <div className="col-span-2">
                <label className="label">Catatan</label>
                <input name="note" className="input" placeholder="mis. money changer, kurs 3.580" />
              </div>
              <button className="btn col-span-2">Catat</button>
              <p className="col-span-2 text-xs text-neutral-500">Tukar valas antar dompet sendiri langsung berlaku. Menyerahkan uang ke orang lain menunggu konfirmasi penerima.</p>
            </form>
          </Card>

          {admin && (
            <Card title="Koreksi saldo (admin)">
              <form action={cashMoveAction} className="grid grid-cols-2 gap-3">
                <input type="hidden" name="type" value="ADJUST" />
                <WalletSelect name="fromWalletId" wallets={wallets} label="Dompet" />
                <div>
                  <label className="label">Jumlah (+ tambah, − kurang)</label>
                  <input name="amount" inputMode="decimal" className="input" placeholder="mis. -50000" required />
                </div>
                <div className="col-span-2">
                  <label className="label">Alasan</label>
                  <input name="note" className="input" required placeholder="mis. saldo awal, selisih hitung fisik" />
                </div>
                <button className="btn col-span-2">Simpan koreksi</button>
              </form>
            </Card>
          )}
        </div>
      )}

      <Card title="Riwayat mutasi kas">
        {history.length === 0 ? (
          <Empty>Belum ada mutasi kas.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Jenis</th>
                  <th>Dari → ke</th>
                  <th className="num">Jumlah</th>
                  <th>Status</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {history.map((m) => {
                  const cur = (m.fromWallet ?? m.toWallet)!.currency;
                  return (
                    <tr key={m.id} className={m.status === "REJECTED" ? "text-neutral-400" : ""}>
                      <td className="whitespace-nowrap">{fmtDate(m.date)}</td>
                      <td>
                        {CASH_MOVE_TYPES[m.type]}
                        {m.category && <div className="text-xs text-neutral-500">{EXPENSE_CATEGORIES[m.category]}</div>}
                      </td>
                      <td className="text-xs">
                        {m.fromWallet?.name ?? "-"} → {m.toWallet?.name ?? (m.type === "EXPENSE" ? "pengeluaran" : "-")}
                        {m.event && <div className="text-neutral-500">{m.event.name}</div>}
                      </td>
                      <td className="num">
                        {formatMoney(m.amount, cur)}
                        {m.toAmount != null && <div className="text-xs text-neutral-500">→ {formatMoney(m.toAmount, m.toWallet!.currency)}</div>}
                      </td>
                      <td className="text-xs">
                        {STATUS[m.status]}
                        {m.confirmedBy && m.status !== "PENDING" && <div className="text-neutral-500">{m.confirmedBy.name}</div>}
                      </td>
                      <td className="text-xs text-neutral-600">
                        {m.note}
                        <div className="text-neutral-400">dicatat {m.createdBy.name}</div>
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
