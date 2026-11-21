import { requireUser } from "@/lib/session";
import { changeMyPin } from "../actions";
import { ROLES } from "@/lib/constants";
import { Card, Flash, PageHeader, str, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n";

export default async function AkunPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await requireUser();
  const pin = { type: "password", inputMode: "numeric", pattern: "[0-9]{4,8}", maxLength: 8, className: "input", required: true } as const;
  return (
    <div className="max-w-md">
      <PageHeader title={t("Akun saya")} desc={`${user.name} · ${t(ROLES[user.role])}`} />
      <Flash ok={str(sp.ok)} error={str(sp.error)} />
      <Card title={t("Ganti PIN")}>
        <form action={changeMyPin} className="space-y-3">
          <div>
            <label className="label">{t("PIN lama")}</label>
            <input name="oldPin" {...pin} />
          </div>
          <div>
            <label className="label">{t("PIN baru (4-8 angka)")}</label>
            <input name="pin" {...pin} />
          </div>
          <div>
            <label className="label">{t("Ulangi PIN baru")}</label>
            <input name="pin2" {...pin} />
          </div>
          <button className="btn">{t("Simpan PIN")}</button>
        </form>
      </Card>
    </div>
  );
}
