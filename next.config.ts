import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Untuk upload gambar QR pembayaran (maks. 1 MB per gambar).
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
