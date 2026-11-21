import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { login, setupOwner } from "../actions";
import { ROLES } from "@/lib/constants";
import { Flash, str, type SP } from "@/components/ui";

const pinProps = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", minLength: 4, maxLength: 8, autoComplete: "off", className: "input text-center text-lg tracking-[0.5em]" } as const;

export default async function MasukPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/");
  const users = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const firstRun = (await db.user.count()) === 0;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-8 text-center">
        <div className="text-4xl font-black tracking-tight">Naeema</div>
        <div className="mt-1 text-xs tracking-[0.4em] text-neutral-500">POS · STOK · KAS</div>
      </div>
      <Flash error={str(sp.error)} />
      {firstRun ? (
        <form action={setupOwner} className="card space-y-3">
          <h1 className="text-sm font-semibold">Buat akun owner</h1>
          <p className="text-xs text-neutral-500">Database masih kosong. Akun pertama ini jadi owner dan bisa menambah anggota tim lainnya.</p>
          <div>
            <label className="label" htmlFor="name">Nama</label>
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
          <button className="btn w-full">Buat akun & masuk</button>
        </form>
      ) : (
        <form action={login} className="card space-y-3">
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
        </form>
      )}
    </div>
  );
}
