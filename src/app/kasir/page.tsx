import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { latestRates } from "@/lib/reports";
import { PageHeader } from "@/components/ui";
import KasirForm from "./KasirForm";
import { fmtDate } from "@/lib/time";

export default async function KasirPage() {
  const user = await requireUser();
  const recent = new Date();
  recent.setDate(recent.getDate() - 7);
  const [locations, events, variants, wallets, rates] = await Promise.all([
    db.location.findMany({ where: { active: true, type: { not: "EVENT" } }, orderBy: { id: "asc" } }),
    db.event.findMany({ where: { endDate: { gte: recent } }, include: { location: true }, orderBy: { startDate: "asc" } }),
    db.variant.findMany({
      where: { active: true, product: { active: true } },
      include: { product: true, prices: true, stocks: true },
      orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    }),
    db.wallet.findMany({ where: { active: true }, include: { owner: true }, orderBy: { name: "asc" } }),
    latestRates(),
  ]);
  return (
    <div>
      <PageHeader title="Kasir" desc="Catat penjualan: sumber, mata uang, dan siapa yang menerima uangnya." />
      <KasirForm
        userId={user.id}
        rates={rates}
        locations={locations.map((l) => ({ id: l.id, name: l.name, type: l.type }))}
        events={events.filter((e) => e.location).map((e) => ({ id: e.id, name: e.name, currency: e.currency, locationId: e.location!.id, dates: `${fmtDate(e.startDate)} - ${fmtDate(e.endDate)}` }))}
        variants={variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.product.name,
          detail: [v.color, v.size].filter(Boolean).join(" / "),
          priceIdr: v.priceIdr,
          prices: Object.fromEntries(v.prices.map((p) => [p.currency, p.price])),
          stock: Object.fromEntries(v.stocks.map((s) => [s.locationId, s.qty])),
        }))}
        wallets={wallets.map((w) => ({ id: w.id, name: w.name, kind: w.kind, currency: w.currency, ownerId: w.ownerId }))}
      />
    </div>
  );
}
