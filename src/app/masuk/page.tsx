import { db } from "@/lib/db";
import { login } from "../actions";
import { ROLES } from "@/lib/constants";
import { Flash, str, type SP } from "@/components/ui";

export default async function MasukPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const users = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-8 text-center">
        <div className="text-4xl font-black tracking-tight">Naeema</div>
        <div className="mt-1 text-xs tracking-[0.4em] text-neutral-500">POS · STOK · KAS</div>
      </div>
      <Flash error={str(sp.error)} />
      <form action={login} className="card space-y-3">
        <label className="label" htmlFor="userId">
          Masuk sebagai
        </label>
        <select id="userId" name="userId" className="input" required>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({ROLES[u.role]})
            </option>
          ))}
        </select>
        <button className="btn w-full">Masuk</button>
        <p className="text-xs text-neutral-500">Versi uji coba: belum memakai password.</p>
      </form>
    </div>
  );
}
