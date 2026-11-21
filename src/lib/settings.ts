import { db } from "./db";
import { DEFAULT_RECEIPT, RECEIPT_KEYS, type ReceiptSettings } from "./receipt";

export async function getReceiptSettings(): Promise<ReceiptSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: RECEIPT_KEYS.map((k) => `receipt.${k}`) } } });
  const s: ReceiptSettings = { ...DEFAULT_RECEIPT };
  for (const r of rows) {
    const k = r.key.slice("receipt.".length) as keyof ReceiptSettings;
    if (k === "paperWidth") s.paperWidth = r.value === "80" ? "80" : "58";
    else s[k] = r.value;
  }
  return s;
}
