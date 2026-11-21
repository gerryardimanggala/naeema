// Bahasa untuk server component dan server action.
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { LANG_COOKIE, langFromAcceptLanguage, makeT, type Lang } from "./i18n-core";

export const getLang = cache(async (): Promise<Lang> => {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (c === "id" || c === "en") return c;
  return langFromAcceptLanguage((await headers()).get("accept-language"));
});

export async function getT() {
  return makeT(await getLang());
}
