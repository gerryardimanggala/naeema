import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { logout } from "./actions";
import { ROLES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Kasir POS",
  description: "Kasir, stok, dan kas untuk toko Anda",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111111" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const links = user
    ? [
        ["/", "Ringkasan"],
        ["/kasir", "Kasir"],
        ["/penjualan", "Penjualan"],
        ["/kas", "Kas"],
        ["/stok", "Stok"],
        ["/event", "Event"],
        ...(isAdmin(user)
          ? [
              ["/produk", "Produk"],
              ["/laporan", "Laporan"],
              ["/pengaturan", "Pengaturan"],
            ]
          : []),
      ]
    : [];
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">
        {user && (
          <header className="print:hidden sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2">
              <Link href="/" className="max-w-[10rem] truncate text-lg font-black tracking-tight">
                {user.business.name}
              </Link>
              <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
                {links.map(([href, label]) => (
                  <Link key={href} href={href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-neutral-700 hover:bg-neutral-100">
                    {label}
                  </Link>
                ))}
              </nav>
              <form action={logout} className="flex items-center gap-2 text-xs text-neutral-500">
                <Link href="/akun" className="hidden rounded-md px-2 py-1 hover:bg-neutral-100 sm:inline">
                  {user.name} · {ROLES[user.role]}
                </Link>
                <button className="rounded-md px-2 py-1 hover:bg-neutral-100">Keluar</button>
              </form>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6 print:m-0 print:max-w-none print:p-0">{children}</main>
      </body>
    </html>
  );
}
