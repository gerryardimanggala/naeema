// Tetapkan bahasa sekali per perangkat: kalau belum ada pilihan, ambil dari bahasa browser lalu simpan di cookie.
// Dengan begitu semua permintaan berikutnya (termasuk aksi formulir) memakai bahasa yang sama.
import { NextResponse, type NextRequest } from "next/server";
import { LANG_COOKIE, langFromAcceptLanguage } from "@/lib/i18n-lang";

export function middleware(req: NextRequest) {
  if (req.cookies.get(LANG_COOKIE)) return NextResponse.next();
  const lang = langFromAcceptLanguage(req.headers.get("accept-language"));
  const headers = new Headers(req.headers);
  headers.set("cookie", [req.headers.get("cookie"), `${LANG_COOKIE}=${lang}`].filter(Boolean).join("; "));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(LANG_COOKIE, lang, { path: "/", maxAge: 365 * 864e2, sameSite: "lax" });
  return res;
}

export const config = {
  matcher: ["/((?!_next/|api/|brand/|icon|apple-icon|manifest|favicon).*)"],
};
