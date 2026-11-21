import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Tidak diizinkan", { status: 401 });
  const { id } = await params;
  const qr = await db.paymentQr.findFirst({ where: { id: Number(id) || 0, businessId: user.businessId }, select: { image: true, mimeType: true } });
  if (!qr) return new Response("Tidak ditemukan", { status: 404 });
  return new Response(new Uint8Array(qr.image), {
    headers: { "Content-Type": qr.mimeType, "Cache-Control": "private, max-age=86400" },
  });
}
