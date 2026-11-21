import { db } from "@/lib/db";

// Logo toko bersifat publik: tampil di halaman masuk sebelum login.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await db.business.findUnique({ where: { slug }, select: { logo: true, logoMime: true } });
  if (!b?.logo || !b.logoMime) return new Response("Tidak ditemukan", { status: 404 });
  return new Response(new Uint8Array(b.logo), {
    headers: {
      "Content-Type": b.logoMime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
