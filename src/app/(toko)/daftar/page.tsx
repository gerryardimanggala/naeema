import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { registerBusiness } from "../actions";
import { Flash, str, type SP } from "@/components/ui";
import { getPlatformSettings, getSubSettings } from "@/lib/platform";
import { formatMoney } from "@/lib/money";
import { LOGO_ACCEPT } from "@/lib/logo";
import { MgPosLogo } from "@/components/brand";
import { getT } from "@/lib/i18n";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Daftar bisnis baru") };
}

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input text-center text-lg tracking-[0.5em]" } as const;

export default async function DaftarPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/");
  const { mode } = await getPlatformSettings();
  const sub = await getSubSettings();
  const needCode = mode === "INVITE";
  const ok = str(sp.ok);
  return (
    <div className="mx-auto mt-12 max-w-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <MgPosLogo size={48} className="mb-3" />
        <div className="text-3xl font-black tracking-tight">{t("Daftar toko di MG-POS")}</div>
        <div className="mt-1 text-sm text-neutral-500">{t("Data setiap bisnis terpisah dan hanya bisa dilihat timnya sendiri.")}</div>
        {sub.trialDays > 0 && (
          <div className="mt-3 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-800">
            {sub.priceMonthly > 0
              ? t("Gratis {n} hari, lalu {price} per bulan", { n: sub.trialDays, price: formatMoney(sub.priceMonthly, "IDR") })
              : t("Gratis {n} hari", { n: sub.trialDays })}
          </div>
        )}
      </div>
      <Flash ok={ok} error={str(sp.error)} />
      {mode === "CLOSED" || ok ? (
        <div className="card text-sm text-neutral-600">
          {ok ? t("Kami akan mengaktifkan toko Anda setelah diperiksa.") : t("Pendaftaran toko baru sedang ditutup. Hubungi admin untuk dibuatkan akun toko.")}
        </div>
      ) : (
      <form action={registerBusiness} className="card space-y-3">
        {mode === "APPROVAL" && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("Toko baru aktif setelah disetujui admin.")}</p>
        )}
        <div>
          <label className="label" htmlFor="businessName">{t("Nama bisnis")}</label>
          <input id="businessName" name="businessName" className="input" required maxLength={80} placeholder={t("mis. Toko Ani Hijab")} />
        </div>
        <div>
          <label className="label" htmlFor="store">{t("Kode toko")}</label>
          <input id="store" name="store" className="input" required minLength={3} maxLength={30} autoCapitalize="none" pattern="[a-zA-Z0-9\-]+" placeholder={t("mis. toko-ani")} />
          <p className="mt-1 text-xs text-neutral-500">{t("Dipakai tim Anda saat masuk. Huruf kecil, angka, dan tanda minus. Tidak bisa diganti nanti.")}</p>
        </div>
        <div>
          <label className="label" htmlFor="logo">{t("Logo toko")}</label>
          <input id="logo" name="logo" type="file" accept={LOGO_ACCEPT} className="input" required />
          <p className="mt-1 text-xs text-neutral-500">{t("PNG, JPG, atau WEBP, maks. 512 KB. Tampil di halaman masuk dan di struk. Logo persegi dengan latar putih paling bagus untuk struk.")}</p>
        </div>
        <hr className="border-neutral-200" />
        <div>
          <label className="label" htmlFor="name">{t("Nama Anda (owner)")}</label>
          <input id="name" name="name" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="pin">{t("PIN (4-8 angka)")}</label>
          <input id="pin" name="pin" required {...pinProps} />
        </div>
        <div>
          <label className="label" htmlFor="pin2">{t("Ulangi PIN")}</label>
          <input id="pin2" name="pin2" required {...pinProps} />
        </div>
        {needCode && (
          <div>
            <label className="label" htmlFor="signupCode">{t("Kode undangan")}</label>
            <input id="signupCode" name="signupCode" className="input" required autoComplete="off" />
          </div>
        )}
        <button className="btn w-full">{mode === "APPROVAL" ? t("Kirim pendaftaran") : t("Daftar & masuk")}</button>
      </form>
      )}
      <p className="mt-4 text-center text-sm text-neutral-500">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-neutral-900 underline">
          {t("Masuk")}
        </Link>
      </p>
    </div>
  );
}
