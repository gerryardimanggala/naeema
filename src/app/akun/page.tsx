import { requireUser } from "@/lib/session";
import { changeMyPin } from "../actions";
import { ROLES } from "@/lib/constants";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";

export default async function AkunPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const pin = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", maxLength: 8, className: "input", required: true } as const;
  return (
    <div className="max-w-md">
      <PageHeader title="Akun saya" desc={`${user.name} · ${ROLES[user.role]}`} />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      <Card title="Ganti PIN">
        <form action={changeMyPin} className="space-y-3">
          <div>
            <label className="label">PIN lama</label>
            <input name="oldPin" {...pin} />
          </div>
          <div>
            <label className="label">PIN baru (4-8 angka)</label>
            <input name="pin" {...pin} />
          </div>
          <div>
            <label className="label">Ulangi PIN baru</label>
            <input name="pin2" {...pin} />
          </div>
          <button className="btn">Simpan PIN</button>
        </form>
      </Card>
    </div>
  );
}
