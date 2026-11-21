import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Alamat lama /masuk tetap jalan (link dan bookmark yang sudah dibagikan).
  async redirects() {
    return [
      { source: "/masuk", destination: "/login", permanent: true },
      { source: "/admin/masuk", destination: "/admin/login", permanent: true },
    ];
  },
  experimental: {
    // Untuk upload gambar QR pembayaran (maks. 1 MB per gambar).
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
