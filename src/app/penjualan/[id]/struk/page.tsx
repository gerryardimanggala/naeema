import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { getReceiptSettings } from "@/lib/settings";
import { buildReceipt, receiptColumns } from "@/lib/receipt";
import { str, type SP } from "@/components/ui";
import ReceiptActions from "./ReceiptActions";

export default async function StrukPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const sale = await db.sale.findFirst({
    where: { id: Number(id) || 0, businessId: user.businessId },
    include: { items: { include: { variant: { include: { product: true } } } }, payments: true, event: true, cashier: true },
  });
  if (!sale || (!isAdmin(user) && sale.cashierId !== user.id)) notFound();
  const settings = await getReceiptSettings(user.businessId);
  const lines = buildReceipt(sale, settings);
  const cols = receiptColumns(settings.paperWidth);
  return (
    <div>
      <style>{`@page { size: ${settings.paperWidth}mm auto; margin: 0; } @media print { body { background: #fff !important; } }`}</style>
      <ReceiptActions saleId={sale.id} lines={lines} auto={str(sp.auto) === "1"} />
      <div className="mx-auto w-fit bg-white p-3 shadow-sm print:p-0 print:shadow-none">
        <div className="font-mono leading-snug text-black" style={{ width: `${cols}ch`, fontSize: "2.5mm" }}>
          {lines.map((l, i) => (
            <div
              key={i}
              className="whitespace-pre"
              style={{ textAlign: l.center ? "center" : "left", fontWeight: l.bold ? 700 : 400, fontSize: l.big ? "1.3em" : undefined }}
            >
              {l.text || " "}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
