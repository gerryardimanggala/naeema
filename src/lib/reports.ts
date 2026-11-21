import { db } from "./db";
import { walletBalances } from "./services";
import { toIdr } from "./money";

export async function latestRates() {
  const rates = await db.exchangeRate.findMany({ orderBy: { date: "desc" } });
  const map: Record<string, number> = { IDR: 1 };
  for (const r of rates) if (!(r.currency in map)) map[r.currency] = r.idrPerUnit;
  return map;
}

/** Posisi uang per dompet, dikelompokkan per pemegang. */
export async function cashPosition(opts: { ownerId?: number } = {}) {
  const [wallets, balances, rates] = await Promise.all([
    db.wallet.findMany({
      where: opts.ownerId ? { ownerId: opts.ownerId } : {},
      include: { owner: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    walletBalances(db),
    latestRates(),
  ]);
  const rows = wallets.map((w) => {
    const b = balances.get(w.id) ?? { received: 0, moneyIn: 0, moneyOut: 0, pendingOut: 0, balance: 0, walletId: w.id };
    return { wallet: w, ...b, balanceIdr: toIdr(b.balance, w.currency, rates[w.currency] ?? 0) };
  });
  const holders = new Map<string, { label: string; kind: string; rows: typeof rows; totalIdr: number }>();
  for (const r of rows) {
    if (!r.wallet.active && r.balance === 0) continue;
    const key = r.wallet.owner ? `u${r.wallet.owner.id}` : `w${r.wallet.id}`;
    const label = r.wallet.owner ? r.wallet.owner.name : r.wallet.name;
    let h = holders.get(key);
    if (!h) holders.set(key, (h = { label, kind: r.wallet.kind, rows: [], totalIdr: 0 }));
    h.rows.push(r);
    h.totalIdr += r.balanceIdr;
  }
  return { rows, holders: [...holders.values()], rates };
}

export function dayRange(from?: string, to?: string) {
  const start = from ? new Date(from + "T00:00:00") : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = to ? new Date(to + "T23:59:59.999") : new Date();
  return { start, end };
}

export function isoDate(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
