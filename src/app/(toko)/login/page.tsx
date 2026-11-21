import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STORE_COOKIE, getCurrentUser } from "@/lib/session";
import { chooseStore, forgetStore, login } from "../actions";
import { ROLES } from "@/lib/constants";
import { normalizeSlug } from "@/lib/business";
import { businessBlockReason } from "@/lib/platform";
import { Flash, str, type SP } from "@/components/ui";
import { MgPosLogo, StoreLogo } from "@/components/brand";
import { getT } from "@/lib/i18n";

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input text-center text-lg tracking-[0.5em]" } as const;

export default async function MasukPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/");
  // ?toko=kode bisa dipakai sebagai tautan langsung ke halaman masuk sebuah toko.
  const slug = normalizeSlug(str(sp.toko) || (await cookies()).get(STORE_COOKIE)?.value || "");
  const business = slug ? await db.business.findUnique({ where: { slug }, omit: { logo: true } }) : null;
  const blocked = business ? businessBlockReason(business) : null;
  const users = business && !blocked
    ? await db.user.findMany({ where: { businessId: business.id, active: true }, orderBy: { name: "asc" } })
    : [];
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        {business ? (
          <>
            <StoreLogo business={business} size={96} />
            <div className="text-3xl font-black tracking-tight">{business.name}</div>
          </>
        ) : (
          <>
            <MgPosLogo size={72} />
            <div>
              <div className="text-4xl font-black tracking-tight">MG-POS</div>
              <div className="mt-1 text-xs tracking-[0.4em] text-neutral-500">{t("POS · STOK · KAS")}</div>
            </div>
          </>
        )}
      </div>
      <Flash error={str(sp.error)} />
      {!business ? (
        <>
          <form action={chooseStore} className="card space-y-3">
            <div>
              <label className="label" htmlFor="store">{t("Kode toko")}</label>
              <input id="store" name="store" className="input" required autoFocus autoCapitalize="none" placeholder={t("mis. toko-ani")} defaultValue={slug} />
              <p className="mt-1 text-xs text-neutral-500">{t("Tanyakan kode toko ke owner bisnis Anda. Perangkat ini akan mengingatnya.")}</p>
            </div>
            <button className="btn w-full">{t("Lanjut")}</button>
          </form>
          <p className="mt-4 text-center text-sm text-neutral-500">
            Belum punya akun bisnis?{" "}
            <Link href="/daftar" className="font-medium text-neutral-900 underline">
              {t("Daftar bisnis baru")}
            </Link>
          </p>
        </>
      ) : (
        <>
          <form action={login} className="card space-y-3">
            <input type="hidden" name="store" value={business.slug} />
            {blocked ? (
              <p className="text-sm text-neutral-600">{t(blocked)}</p>
            ) : users.length ? (
              <>
                <div>
                  <label className="label" htmlFor="userId">{t("Nama")}</label>
                  <select id="userId" name="userId" className="input" required>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({t(ROLES[u.role])})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="pin">{t("PIN")}</label>
                  <input id="pin" name="pin" required autoFocus {...pinProps} />
                </div>
                <button className="btn w-full">{t("Masuk")}</button>
              </>
            ) : (
              <p className="text-sm text-neutral-500">{t("Belum ada pengguna aktif di toko ini.")}</p>
            )}
          </form>
          <form action={forgetStore} className="mt-4 text-center text-sm text-neutral-500">
            {t("Kode toko:")} <b className="text-neutral-800">{business.slug}</b> ·{" "}
            <button className="underline">{t("Ganti toko")}</button>
          </form>
        </>
      )}
    </div>
  );
}
