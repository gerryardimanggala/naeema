import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { businessSubscription, getSubSettings } from "@/lib/platform";
import { isLocked } from "@/lib/subscription";
import { fmtDate } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { getT } from "@/lib/i18n";
import { logout } from "../actions";
import { Card, Empty, PageHeader } from "@/components/ui";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Langganan") };
}

/** Status langganan toko dan cara memperpanjang. Tetap bisa dibuka walau langganan sudah habis. */
export default async function LanggananPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();
  const [sub, settings, payments] = await Promise.all([
    businessSubscription(user.business),
    getSubSettings(),
    isAdmin(user)
      ? db.subscriptionPayment.findMany({ where: { businessId: user.businessId }, orderBy: { createdAt: "desc" }, take: 24 })
      : Promise.resolve([]),
  ]);
  const locked = isLocked(sub);

  const status =
    sub.kind === "free"
      ? { tone: "border-green-200 bg-green-50 text-green-900", title: t("Gratis"), text: t("Toko ini tidak perlu membayar langganan.") }
      : sub.kind === "active"
        ? { tone: "border-green-200 bg-green-50 text-green-900", title: t("Aktif"), text: t("Aktif sampai {date} ({n} hari lagi).", { date: fmtDate(sub.until), n: sub.daysLeft }) }
        : sub.kind === "expiring"
          ? { tone: "border-amber-200 bg-amber-50 text-amber-900", title: t("Segera habis"), text: t("Aktif sampai {date} ({n} hari lagi).", { date: fmtDate(sub.until), n: sub.daysLeft }) }
          : sub.kind === "grace"
            ? { tone: "border-red-200 bg-red-50 text-red-800", title: t("Masa tenggang"), text: t("Langganan toko habis pada {date}. Toko akan terkunci dalam {n} hari.", { date: fmtDate(sub.until), n: sub.graceLeft }) }
            : {
                tone: "border-red-200 bg-red-50 text-red-800",
                title: t("Langganan habis"),
                text: sub.kind === "expired"
                  ? t("Langganan habis pada {date}. Data toko tetap aman dan bisa dipakai lagi setelah diperpanjang.", { date: fmtDate(sub.until) })
                  : t("Toko ini belum punya langganan aktif. Data toko tetap aman dan bisa dipakai lagi setelah diperpanjang."),
              };

  return (
    <div className="max-w-2xl">
      <PageHeader title={t("Langganan")} desc={t("Masa aktif MG-POS untuk toko {name}.", { name: user.business.name })} />
      <div className={`mb-4 rounded-lg border p-4 ${status.tone}`}>
        <div className="text-lg font-semibold">{status.title}</div>
        <p className="mt-1 text-sm">{status.text}</p>
      </div>

      {sub.kind !== "free" && (
        <Card title={t("Cara perpanjang")} className="mb-4">
          {settings.priceMonthly > 0 && (
            <p className="mb-2 text-sm">
              {t("Biaya: {price} per bulan.", { price: formatMoney(settings.priceMonthly, "IDR") })}
            </p>
          )}
          {settings.payInfo ? (
            <p className="whitespace-pre-line rounded-md bg-neutral-50 p-3 text-sm">{settings.payInfo}</p>
          ) : (
            <p className="text-sm text-neutral-600">{t("Hubungi admin MG-POS untuk memperpanjang.")}</p>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            {t("Setelah pembayaran dikonfirmasi admin, masa aktif diperpanjang dan toko langsung bisa dipakai lagi. Sebutkan kode toko {slug} saat membayar.", { slug: user.business.slug })}
          </p>
        </Card>
      )}

      {isAdmin(user) && sub.kind !== "free" && (
        <Card title={t("Riwayat perpanjangan")} className="mb-4">
          {payments.length === 0 ? (
            <Empty>{t("Belum ada perpanjangan.")}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t("Tanggal")}</th>
                    <th>{t("Lama")}</th>
                    <th className="num">{t("Dibayar")}</th>
                    <th>{t("Aktif sampai")}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.createdAt)}</td>
                      <td>{p.months ? t("{n} bulan", { n: p.months }) : t("diatur admin")}</td>
                      <td className="num">{p.amount ? formatMoney(p.amount, "IDR") : "-"}</td>
                      <td>{fmtDate(p.toDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {locked && (
        <form action={logout}>
          <button className="btn-secondary">{t("Keluar")}</button>
        </form>
      )}
    </div>
  );
}
