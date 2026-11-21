import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MG-POS", template: "%s · MG-POS" },
  description: "MG-POS: kasir, stok, dan kas untuk toko",
  manifest: "/manifest.webmanifest",
  applicationName: "MG-POS",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111111" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
