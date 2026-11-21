import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STORE_COOKIE, getCurrentUser } from "@/lib/session";
import { chooseStore, forgetStore, login } from "../actions";
import { ROLES } from "@/lib/constants";
import { normalizeSlug } from "@/lib/business";
import { Flash, str, type SP } from "@/components/ui";

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input text-center text-lg tracking-[0.5em]" } as const;

export default async function MasukPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/");
  // ?toko=kode bisa dipakai sebagai tautan langsung ke halaman masuk sebuah toko.
  const slug = normalizeSlug(str(sp.toko) || (await cookies()).get(STORE_COOKIE)?.value || "");
  const business = slug ? await db.business.findFirst({ where: { slug, active: true } }) : null;
  const users = business
    ? await db.user.findMany({ where: { businessId: business.id, active: true }, orderBy: { name: "asc" } })
    : [];
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-8 text-center">
        <div className="text-4xl font-black tracking-tight">{business?.name ?? "Kasir"}</div>
        <div className="mt-1 text-xs tracking-[0.4em] text-neutral-500">POS · STOK · KAS</div>
      </div>
      <Flash error={str(sp.error)} />
      {!business ? (
        <>
          <form action={chooseStore} className="card space-y-3">
            <div>
              <label className="label" htmlFor="store">Kode toko</label>
              <input id="store" name="store" className="input" required autoFocus autoCapitalize="none" placeholder="mis. naeema" defaultValue={slug} />
              <p className="mt-1 text-xs text-neutral-500">Tanyakan kode toko ke owner bisnis Anda. Perangkat ini akan mengingatnya.</p>
            </div>
            <button className="btn w-full">Lanjut</button>
          </form>
          <p className="mt-4 text-center text-sm text-neutral-500">
            Belum punya akun bisnis?{" "}
            <Link href="/daftar" className="font-medium text-neutral-900 underline">
              Daftar bisnis baru
            </Link>
          </p>
        </>
      ) : (
        <>
          <form action={login} className="card space-y-3">
            <input type="hidden" name="store" value={business.slug} />
            {users.length ? (
              <>
                <div>
                  <label className="label" htmlFor="userId">Nama</label>
                  <select id="userId" name="userId" className="input" required>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({ROLES[u.role]})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="pin">PIN</label>
                  <input id="pin" name="pin" required autoFocus {...pinProps} />
                </div>
                <button className="btn w-full">Masuk</button>
              </>
            ) : (
              <p className="text-sm text-neutral-500">Belum ada pengguna aktif di toko ini.</p>
            )}
          </form>
          <form action={forgetStore} className="mt-4 text-center text-sm text-neutral-500">
            Kode toko: <b className="text-neutral-800">{business.slug}</b> ·{" "}
            <button className="underline">Ganti toko</button>
          </form>
        </>
      )}
    </div>
  );
}
