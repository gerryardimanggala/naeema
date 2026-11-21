import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/admin-session";
import { MgPosLogo } from "@/components/brand";
import { Flash, str, type SP } from "@/components/ui";
import { adminLogin, setupFirstAdmin } from "../actions";
import { getLang, getT } from "@/lib/i18n";
import LangSwitch from "@/components/LangSwitch";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Masuk admin") };
}

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input text-center text-lg tracking-[0.5em]" } as const;

export default async function AdminMasukPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  if (await getCurrentAdmin()) redirect("/admin");
  const firstRun = (await db.platformAdmin.count()) === 0;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <MgPosLogo size={72} />
        <div>
          <div className="text-3xl font-black tracking-tight">MG-POS</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.4em] text-amber-600">{t("Admin")}</div>
        </div>
      </div>
      <Flash error={str(sp.error)} />
      {firstRun ? (
        <form action={setupFirstAdmin} className="card space-y-3">
          <h1 className="text-sm font-semibold">{t("Buat akun admin pertama")}</h1>
          <p className="text-xs text-neutral-500">{t("Belum ada admin. Akun ini bisa mengatur semua toko dan menambah admin lain.")}</p>
          <div>
            <label className="label" htmlFor="name">{t("Nama")}</label>
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
          <button className="btn w-full">{t("Buat & masuk")}</button>
        </form>
      ) : (
        <form action={adminLogin} className="card space-y-3">
          <div>
            <label className="label" htmlFor="name">{t("Nama admin")}</label>
            <input id="name" name="name" className="input" required autoFocus autoComplete="username" />
          </div>
          <div>
            <label className="label" htmlFor="pin">{t("PIN")}</label>
            <input id="pin" name="pin" required {...pinProps} />
          </div>
          <button className="btn w-full">{t("Masuk")}</button>
        </form>
      )}
      <div className="mt-6 flex justify-center">
        <LangSwitch lang={await getLang()} />
      </div>
      <p className="mt-4 text-center text-xs text-neutral-500">{t("Halaman ini khusus admin MG-POS. Untuk kasir dan pemilik toko, masuk lewat halaman toko.")}</p>
    </div>
  );
}
