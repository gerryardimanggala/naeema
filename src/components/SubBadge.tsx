import { fmtDate } from "@/lib/time";
import type { SubState } from "@/lib/subscription";
import type { T } from "@/lib/i18n-core";

/** Status langganan singkat untuk daftar toko. */
export function subBadge(s: SubState, t: T) {
  switch (s.kind) {
    case "free":
      return <span className="badge bg-green-100 text-green-800">{t("Gratis")}</span>;
    case "active":
      return <span className="text-xs">{t("s/d {date}", { date: fmtDate(s.until) })}</span>;
    case "expiring":
      return <span className="badge bg-amber-100 text-amber-800">{t("{n} hari lagi", { n: s.daysLeft })}</span>;
    case "grace":
      return <span className="badge bg-red-100 text-red-800">{t("Tenggang {n} hari", { n: s.graceLeft })}</span>;
    case "expired":
      return <span className="badge bg-red-100 text-red-800">{t("Habis {date}", { date: fmtDate(s.until) })}</span>;
    default:
      return <span className="badge bg-red-100 text-red-800">{t("Belum langganan")}</span>;
  }
}

