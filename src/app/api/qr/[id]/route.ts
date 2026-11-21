import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Tidak diizinkan", { status: 401 });
  const { id } = await params;
  const qr = await db.paymentQr.findUnique({ where: { id: Number(id) }, select: { image: true, mimeType: true } });
  if (!qr) return new Response("Tidak ditemukan", { status: 404 });
  return new Response(new Uint8Array(qr.image), {
    headers: { "Content-Type": qr.mimeType, "Cache-Control": "private, max-age=86400" },
  });
}
