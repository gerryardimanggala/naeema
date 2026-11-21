import { db } from "./db";
import { walletBalances } from "./services";
import { toIdr } from "./money";
import { endOfDay, jakartaDay, startOfDay } from "./time";

export async function latestRates(businessId: number) {
  const rates = await db.exchangeRate.findMany({ where: { businessId }, orderBy: { date: "desc" } });
  const map: Record<string, number> = { IDR: 1 };
  for (const r of rates) if (!(r.currency in map)) map[r.currency] = r.idrPerUnit;
  return map;
}

/** Posisi uang per dompet, dikelompokkan per pemegang. */
export async function cashPosition(businessId: number, opts: { ownerId?: number } = {}) {
  const [wallets, balances, rates] = await Promise.all([
    db.wallet.findMany({
      where: { businessId, ...(opts.ownerId ? { ownerId: opts.ownerId } : {}) },
      include: { owner: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    walletBalances(db, businessId),
    latestRates(businessId),
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
  const today = jakartaDay();
  const start = startOfDay(from || today.slice(0, 8) + "01");
  const end = endOfDay(to || today);
  return { start, end };
}

export function isoDate(d: Date) {
  return jakartaDay(d);
}
