import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { latestRates } from "@/lib/reports";
import { endOfDay, fmtDate, jakartaDay, startOfDay } from "@/lib/time";
import { formatMoney, toIdr } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { getT } from "@/lib/i18n";
import { cancelExpenseAction, expenseAction } from "../actions";
import { Card, Empty, Flash, PageHeader, Stat, str, type SP } from "@/components/ui";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Pengeluaran") };
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: startOfDay(`${month}-01`), end: endOfDay(`${month}-${String(last).padStart(2, "0")}`) };
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Biaya operasional: sewa, gaji, listrik, iklan, packing, dan lain-lain. Tercatat sebagai mutasi kas keluar. */
export default async function PengeluaranPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const t = await getT();
  const bid = user.businessId;
  const admin = isAdmin(user);
  const today = jakartaDay();
  const thisMonth = today.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(str(sp.bulan) ?? "") ? str(sp.bulan)! : thisMonth;
  const cat = str(sp.kategori) && t(EXPENSE_CATEGORIES[str(sp.kategori)!]) ? str(sp.kategori)! : "";
  const { start, end } = monthRange(month);
  const scope = admin ? {} : { OR: [{ createdById: user.id }, { fromWallet: { ownerId: user.id } }] };

  const [wallets, events, rows, rates] = await Promise.all([
    db.wallet.findMany({ where: { businessId: bid, active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.event.findMany({ where: { businessId: bid }, orderBy: { startDate: "desc" }, take: 20 }),
    db.cashMove.findMany({
      where: { businessId: bid, type: "EXPENSE", date: { gte: start, lte: end }, ...(cat ? { category: cat } : {}), ...scope },
      include: { fromWallet: true, createdBy: true, event: true },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }),
    latestRates(bid),
  ]);
  const mine = admin ? wallets : wallets.filter((w) => w.ownerId === user.id);
  const valid = rows.filter((r) => r.status === "CONFIRMED");

  // Total per mata uang dan per kategori, plus perkiraan dalam rupiah dengan kurs terbaru.
  const byCurrency = new Map<string, number>();
  const byCat = new Map<string, { idr: number; cur: Map<string, number>; count: number }>();
  let totalIdr = 0;
  let missingRate = false;
  for (const r of valid) {
    const cur = r.fromWallet!.currency;
    byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + r.amount);
    const rate = rates[cur];
    if (rate == null) missingRate = true;
    const idr = toIdr(r.amount, cur, rate ?? 0);
    totalIdr += idr;
    const key = r.category ?? "LAINNYA";
    const c = byCat.get(key) ?? { idr: 0, cur: new Map(), count: 0 };
    c.idr += idr;
    c.count += 1;
    c.cur.set(cur, (c.cur.get(cur) ?? 0) + r.amount);
    byCat.set(key, c);
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1].idr - a[1].idr);
  const maxIdr = Math.max(1, ...cats.map(([, c]) => c.idr));
  const multiCurrency = byCurrency.size > 1 || [...byCurrency.keys()].some((c) => c !== "IDR");

  return (
    <div>
      <PageHeader title={t("Pengeluaran operasional")} desc={t("Biaya rutin toko seperti sewa, gaji, listrik, iklan, dan packing. Uangnya keluar dari dompet yang dipilih.")} />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />

      <form className="mb-4 flex flex-wrap items-end gap-2" action="/pengeluaran">
        <a href={`/pengeluaran?bulan=${shiftMonth(month, -1)}${cat ? `&kategori=${cat}` : ""}`} className="btn-secondary" aria-label={t("Bulan sebelumnya")}>
          ‹
        </a>
        <div>
          <label className="label" htmlFor="bulan">{t("Bulan")}</label>
          <input type="month" id="bulan" name="bulan" defaultValue={month} className="input" />
        </div>
        <a href={`/pengeluaran?bulan=${shiftMonth(month, 1)}${cat ? `&kategori=${cat}` : ""}`} className="btn-secondary" aria-label={t("Bulan berikutnya")}>
          ›
        </a>
        <div>
          <label className="label" htmlFor="kategori">{t("Kategori")}</label>
          <select id="kategori" name="kategori" defaultValue={cat} className="input">
            <option value="">{t("Semua kategori")}</option>
            {Object.entries(EXPENSE_CATEGORIES).map(([k, l]) => (
              <option key={k} value={k}>{t(l)}</option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">{t("Tampilkan")}</button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label={multiCurrency ? t("Total bulan ini (setara rupiah)") : t("Total bulan ini")}
          value={formatMoney(totalIdr, "IDR")}
          sub={missingRate ? t("Sebagian mata uang belum punya kurs.") : multiCurrency ? t("kurs terbaru") : undefined}
        />
        {multiCurrency &&
          [...byCurrency.entries()].map(([cur, v]) => <Stat key={cur} label={t("Dibayar dalam {cur}", { cur })} value={formatMoney(v, cur)} />)}
        <Stat label={t("Jumlah transaksi")} value={valid.length} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {mine.length > 0 ? (
          <Card title={t("Catat pengeluaran")}>
            <form action={expenseAction} className="grid grid-cols-2 gap-3">
              <input type="hidden" name="bulan" value={month} />
              <div>
                <label className="label" htmlFor="e-date">{t("Tanggal")}</label>
                <input type="date" id="e-date" name="date" defaultValue={month === thisMonth ? today : `${month}-01`} className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="e-cat">{t("Kategori")}</label>
                <select id="e-cat" name="category" className="input" defaultValue={cat || "SEWA"}>
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, l]) => (
                    <option key={k} value={k}>{t(l)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="e-wallet">{t("Dibayar dari")}</label>
                <select id="e-wallet" name="fromWalletId" className="input" required>
                  {mine.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="e-amount">{t("Jumlah")}</label>
                <input id="e-amount" name="amount" inputMode="decimal" className="input" required />
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor="e-note">{t("Keterangan")}</label>
                <input id="e-note" name="note" className="input" required placeholder={t("mis. sewa ruko November, gaji Sari")} />
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor="e-event">{t("Event (opsional)")}</label>
                <select id="e-event" name="eventId" className="input">
                  <option value="">{t("- bukan biaya event -")}</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <button className="btn col-span-2">{t("Catat pengeluaran")}</button>
              <p className="col-span-2 text-xs text-neutral-500">
                {admin ? t("Pengeluaran langsung mengurangi saldo dompet.") : t("Anda hanya bisa membayar dari dompet sendiri. Pengeluaran langsung mengurangi saldo.")}
              </p>
            </form>
          </Card>
        ) : (
          <Card title={t("Catat pengeluaran")}>
            <Empty>{t("Anda belum punya dompet. Minta admin membuatkan dompet di Pengaturan.")}</Empty>
          </Card>
        )}

        <Card title={t("Per kategori")}>
          {cats.length === 0 ? (
            <Empty>{t("Belum ada pengeluaran bulan ini.")}</Empty>
          ) : (
            <div className="space-y-2">
              {cats.map(([k, c]) => (
                <a key={k} href={`/pengeluaran?bulan=${month}&kategori=${k}`} className="block rounded-md hover:bg-neutral-50">
                  <div className="flex justify-between gap-2 text-sm">
                    <span>
                      {t(EXPENSE_CATEGORIES[k] ?? k)} <span className="text-xs text-neutral-500">· {c.count}</span>
                    </span>
                    <span className="tabular-nums">{formatMoney(c.idr, "IDR")}</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-neutral-100">
                    <div className="h-2 rounded bg-neutral-800" style={{ width: `${(c.idr / maxIdr) * 100}%` }} />
                  </div>
                  {multiCurrency && (
                    <div className="text-xs text-neutral-500">
                      {[...c.cur.entries()].map(([cur, v]) => formatMoney(v, cur)).join(" + ")}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title={cat ? t("Daftar pengeluaran: {cat}", { cat: t(EXPENSE_CATEGORIES[cat]) }) : t("Daftar pengeluaran")}>
        {rows.length === 0 ? (
          <Empty>{t("Belum ada pengeluaran bulan ini.")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("Tanggal")}</th>
                  <th>{t("Kategori")}</th>
                  <th>{t("Keterangan")}</th>
                  <th>{t("Dibayar dari")}</th>
                  <th className="num">{t("Jumlah")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cancelled = r.status === "REJECTED";
                  const canCancel = !cancelled && (admin || r.createdById === user.id);
                  return (
                    <tr key={r.id} className={cancelled ? "text-neutral-400 line-through decoration-neutral-300" : ""}>
                      <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td>{t(EXPENSE_CATEGORIES[r.category ?? "LAINNYA"] ?? r.category ?? "")}</td>
                      <td>
                        {r.note}
                        <div className="text-xs text-neutral-500">
                          {t("dicatat {name}", { name: r.createdBy.name })}
                          {r.event && ` · ${r.event.name}`}
                        </div>
                      </td>
                      <td className="text-xs">{r.fromWallet?.name}</td>
                      <td className="num">{formatMoney(r.amount, r.fromWallet!.currency)}</td>
                      <td className="whitespace-nowrap text-right">
                        {cancelled ? (
                          <span className="badge no-underline">{t("dibatalkan")}</span>
                        ) : canCancel ? (
                          <form action={cancelExpenseAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="bulan" value={month} />
                            <button className="btn-danger">{t("Batalkan")}</button>
                          </form>
                        ) : null}
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
