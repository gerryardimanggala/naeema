import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { dayRange } from "@/lib/reports";
import { fromMinor } from "@/lib/money";
import { CHANNELS, MARKETPLACES, PAYMENT_METHODS } from "@/lib/constants";

function csv(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return new Response("Tidak diizinkan", { status: 403 });
  const url = new URL(req.url);
  const { start, end } = dayRange(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
  const sales = await db.sale.findMany({
    where: { date: { gte: start, lte: end } },
    include: { event: true, cashier: true, location: true, payments: { include: { wallet: true } } },
    orderBy: { date: "asc" },
  });
  const header = ["nota", "tanggal", "status", "sumber", "marketplace", "no_pesanan", "event", "lokasi_stok", "kasir", "mata_uang", "kurs_idr", "subtotal", "diskon", "total", "total_idr", "pembayaran"];
  const rows = sales.map((s) => [
    s.number, s.date.toISOString(), s.status, CHANNELS[s.channel], s.marketplace ? MARKETPLACES[s.marketplace] : "", s.externalRef, s.event?.name, s.location.name,
    s.cashier.name, s.currency, s.rateToIdr, fromMinor(s.subtotal, s.currency), fromMinor(s.discount, s.currency), fromMinor(s.total, s.currency), s.totalIdr,
    s.payments.map((p) => `${PAYMENT_METHODS[p.method]} ${fromMinor(p.amount, s.currency)} -> ${p.wallet.name}`).join(" | "),
  ]);
  const body = [header, ...rows].map((r) => r.map(csv).join(",")).join("\n");
  return new Response("﻿" + body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="penjualan-naeema.csv"` },
  });
}
