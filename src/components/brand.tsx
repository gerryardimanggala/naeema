/* eslint-disable @next/next/no-img-element */
import { logoUrl } from "@/lib/logo";

export const APP_NAME = "MG-POS";

export function MgPosLogo({ size = 32, withName = false, className = "" }: { size?: number; withName?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/brand/mg-pos-icon.svg" alt={withName ? "" : APP_NAME} width={size} height={size} />
      {withName && <span className="font-black tracking-tight" style={{ fontSize: size * 0.6 }}>{APP_NAME}</span>}
    </span>
  );
}

/** Logo toko, atau inisial nama toko kalau belum punya logo. */
export function StoreLogo({ business, size = 40 }: { business: { name: string; slug: string; logoAt: Date | null }; size?: number }) {
  const url = logoUrl(business);
  if (url) return <img src={url} alt={business.name} width={size} height={size} className="rounded-md object-contain" style={{ width: size, height: size }} />;
  const initials = business.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      className="inline-flex items-center justify-center rounded-md bg-neutral-900 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
