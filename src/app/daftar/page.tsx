import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { registerBusiness } from "../actions";
import { Flash, str, type SP } from "@/components/ui";
import { getPlatformSettings } from "@/lib/platform";

export const metadata = { title: "Daftar bisnis baru" };

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input text-center text-lg tracking-[0.5em]" } as const;

export default async function DaftarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/");
  const { mode } = await getPlatformSettings();
  const needCode = mode === "INVITE";
  const ok = str(sp.ok);
  return (
    <div className="mx-auto mt-12 max-w-sm">
      <div className="mb-6 text-center">
        <div className="text-3xl font-black tracking-tight">Daftar bisnis baru</div>
        <div className="mt-1 text-sm text-neutral-500">Data setiap bisnis terpisah dan hanya bisa dilihat timnya sendiri.</div>
      </div>
      <Flash ok={ok} error={str(sp.error)} />
      {mode === "CLOSED" || ok ? (
        <div className="card text-sm text-neutral-600">
          {ok ? "Kami akan mengaktifkan toko Anda setelah diperiksa." : "Pendaftaran toko baru sedang ditutup. Hubungi admin untuk dibuatkan akun toko."}
        </div>
      ) : (
      <form action={registerBusiness} className="card space-y-3">
        {mode === "APPROVAL" && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Toko baru aktif setelah disetujui admin.</p>
        )}
        <div>
          <label className="label" htmlFor="businessName">Nama bisnis</label>
          <input id="businessName" name="businessName" className="input" required maxLength={80} placeholder="mis. Toko Ani Hijab" />
        </div>
        <div>
          <label className="label" htmlFor="store">Kode toko</label>
          <input id="store" name="store" className="input" required minLength={3} maxLength={30} autoCapitalize="none" pattern="[a-zA-Z0-9\-]+" placeholder="mis. toko-ani" />
          <p className="mt-1 text-xs text-neutral-500">Dipakai tim Anda saat masuk. Huruf kecil, angka, dan tanda minus. Tidak bisa diganti nanti.</p>
        </div>
        <hr className="border-neutral-200" />
        <div>
          <label className="label" htmlFor="name">Nama Anda (owner)</label>
          <input id="name" name="name" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="pin">PIN (4-8 angka)</label>
          <input id="pin" name="pin" required {...pinProps} />
        </div>
        <div>
          <label className="label" htmlFor="pin2">Ulangi PIN</label>
          <input id="pin2" name="pin2" required {...pinProps} />
        </div>
        {needCode && (
          <div>
            <label className="label" htmlFor="signupCode">Kode undangan</label>
            <input id="signupCode" name="signupCode" className="input" required autoComplete="off" />
          </div>
        )}
        <button className="btn w-full">{mode === "APPROVAL" ? "Kirim pendaftaran" : "Daftar & masuk"}</button>
      </form>
      )}
      <p className="mt-4 text-center text-sm text-neutral-500">
        Sudah punya akun?{" "}
        <Link href="/masuk" className="font-medium text-neutral-900 underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
