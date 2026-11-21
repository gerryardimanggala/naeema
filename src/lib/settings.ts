import { db } from "./db";
import { DEFAULT_RECEIPT, RECEIPT_KEYS, type ReceiptSettings } from "./receipt";

export async function getReceiptSettings(businessId: number): Promise<ReceiptSettings> {
  const [business, rows] = await Promise.all([
    db.business.findUnique({ where: { id: businessId } }),
    db.setting.findMany({ where: { businessId, key: { in: RECEIPT_KEYS.map((k) => `receipt.${k}`) } } }),
  ]);
  const s: ReceiptSettings = { ...DEFAULT_RECEIPT };
  for (const r of rows) {
    const k = r.key.slice("receipt.".length) as keyof ReceiptSettings;
    if (k === "paperWidth") s.paperWidth = r.value === "80" ? "80" : "58";
    else s[k] = r.value;
  }
  // Nama toko kosong berarti pakai nama bisnis.
  if (!s.storeName.trim()) s.storeName = (business?.name ?? "").toUpperCase();
  return s;
}
