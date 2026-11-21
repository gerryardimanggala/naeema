import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLang, getT } from "@/lib/i18n";
import { I18nProvider } from "@/components/I18nProvider";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: "MG-POS", template: "%s · MG-POS" },
    description: t("MG-POS: kasir, stok, dan kas untuk toko"),
    manifest: "/manifest.webmanifest",
    applicationName: "MG-POS",
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111111" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body className="min-h-screen antialiased">
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
