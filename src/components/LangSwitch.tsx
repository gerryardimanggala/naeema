"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE, type Lang } from "@/lib/i18n-core";

/** Tombol ID | EN. Pilihan disimpan di perangkat ini selama setahun. */
export default function LangSwitch({ lang, className = "" }: { lang: Lang; className?: string }) {
  const router = useRouter();
  function set(l: Lang) {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }
  return (
    <span className={`inline-flex overflow-hidden rounded-md border border-neutral-300 text-xs ${className}`} role="group" aria-label="Language">
      {(["id", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          aria-pressed={lang === l}
          className={`px-2 py-1 font-semibold ${lang === l ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </span>
  );
}
