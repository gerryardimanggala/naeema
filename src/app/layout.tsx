import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { logout } from "./actions";
import { ROLES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Naeema POS",
  description: "Kasir, stok, dan kas Naeema",
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
          <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2">
              <Link href="/" className="text-lg font-black tracking-tight">
                Naeema
              </Link>
              <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
                {links.map(([href, label]) => (
                  <Link key={href} href={href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-neutral-700 hover:bg-neutral-100">
                    {label}
                  </Link>
                ))}
              </nav>
              <form action={logout} className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="hidden sm:inline">
                  {user.name} · {ROLES[user.role]}
                </span>
                <button className="rounded-md px-2 py-1 hover:bg-neutral-100">Ganti</button>
              </form>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
