import Link from "next/link";
import { getCurrentAdmin } from "@/lib/admin-session";
import { MgPosLogo } from "@/components/brand";
import { adminLogout } from "./actions";

export const metadata = { title: { default: "Admin", template: "%s · Admin MG-POS" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  return (
    <div className="min-h-screen bg-neutral-100">
      {admin && (
        <header className="sticky top-0 z-10 bg-neutral-900 text-white">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2">
            <Link href="/admin" className="flex items-center gap-2">
              <MgPosLogo size={30} />
              <span className="text-lg font-black tracking-tight">MG-POS</span>
              <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-900">Admin</span>
            </Link>
            <nav className="flex flex-1 gap-1 text-sm">
              <Link href="/admin" className="rounded-md px-2.5 py-1.5 text-neutral-200 hover:bg-white/10">Toko</Link>
              <Link href="/admin/akun" className="rounded-md px-2.5 py-1.5 text-neutral-200 hover:bg-white/10">Akun admin</Link>
            </nav>
            <form action={adminLogout} className="flex items-center gap-2 text-xs text-neutral-300">
              <span className="hidden sm:inline">{admin.name}</span>
              <button className="rounded-md px-2 py-1 hover:bg-white/10">Keluar</button>
            </form>
          </div>
        </header>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
