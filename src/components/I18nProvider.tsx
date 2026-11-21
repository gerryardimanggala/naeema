"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Lang, type T } from "@/lib/i18n-core";

const Ctx = createContext<{ lang: Lang; t: T }>({ lang: "id", t: makeT("id") });

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: makeT(lang) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}
