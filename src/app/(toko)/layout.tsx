import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { logout } from "./actions";
import { MgPosLogo, StoreLogo } from "@/components/brand";
import { ROLES } from "@/lib/constants";
import NavLinks from "./NavLinks";

export default async function TokoLayout({ children }: { children: React.ReactNode }) {
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
    <>
      {user && (
        <header className="print:hidden z-10 sm:sticky sm:top-0 border-b border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-2">
            <Link href="/" className="flex min-w-0 flex-1 items-center gap-2">
              <StoreLogo business={user.business} size={32} />
              <span className="truncate text-lg font-black tracking-tight">{user.business.name}</span>
            </Link>
            <form action={logout} className="flex shrink-0 items-center gap-1 text-xs text-neutral-500">
              <Link href="/akun" className="max-w-[8rem] truncate rounded-md px-2 py-1 hover:bg-neutral-100">
                {user.name}
                <span className="hidden sm:inline"> · {ROLES[user.role]}</span>
              </Link>
              <button className="rounded-md px-2 py-1 hover:bg-neutral-100">Keluar</button>
            </form>
          </div>
          <div className="mx-auto max-w-6xl px-3 pb-2 pt-1.5">
            <NavLinks links={links as [string, string][]} />
          </div>
        </header>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6 print:m-0 print:max-w-none print:p-0">{children}</main>
      <footer className="py-6 text-center text-xs text-neutral-400 print:hidden">
        <MgPosLogo size={16} withName className="opacity-60" />
      </footer>
    </>
  );
}
