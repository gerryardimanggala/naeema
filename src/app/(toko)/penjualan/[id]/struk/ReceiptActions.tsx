"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReceiptLine } from "@/lib/receipt";
import { receiptToEscPos, rgbaToRaster, type Raster } from "@/lib/escpos";
import { useT } from "@/components/I18nProvider";

// Layanan Bluetooth yang umum dipakai printer thermal murah (58/80 mm).
const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
];

type Char = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(d: BufferSource): Promise<void>;
  writeValueWithoutResponse?(d: BufferSource): Promise<void>;
};
type Device = {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{ getPrimaryServices(): Promise<{ getCharacteristics(): Promise<Char[]> }[]> }>;
  };
};
type Bluetooth = { requestDevice(o: { acceptAllDevices: boolean; optionalServices: string[] }): Promise<Device> };

// Disimpan selama tab terbuka supaya tidak perlu memilih printer setiap nota.
let cached: { device: Device; char: Char } | null = null;

async function findWritable(device: Device): Promise<Char> {
  const server = await device.gatt!.connect();
  for (const svc of await server.getPrimaryServices()) {
    for (const c of await svc.getCharacteristics()) {
      if (c.properties.writeWithoutResponse || c.properties.write) return c;
    }
  }
  throw new Error("Printer tidak punya saluran tulis yang dikenali.");
}

/** Muat logo, perkecil ke lebar titik printer, lalu ubah jadi raster hitam-putih. */
async function loadLogo(url: string, dots: number): Promise<Raster> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const width = Math.min(dots, img.naturalWidth) & ~7; // kelipatan 8
  const height = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return rgbaToRaster(ctx.getImageData(0, 0, width, height).data, width, height);
}

async function printBluetooth(lines: ReceiptLine[], logo: { url: string; dots: number } | null) {
  const bt = (navigator as unknown as { bluetooth?: Bluetooth }).bluetooth;
  if (!bt) throw new Error("Browser ini tidak mendukung Bluetooth. Pakai Chrome di Android atau laptop, atau tombol Cetak biasa.");
  if (!cached || !cached.device.gatt?.connected) {
    const device = cached?.device ?? (await bt.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES }));
    cached = { device, char: await findWritable(device) };
  }
  let raster: Raster | null = null;
  if (logo) {
    try {
      raster = await loadLogo(logo.url, logo.dots);
    } catch {
      raster = null; // logo gagal dimuat: struk tetap dicetak tanpa logo
    }
  }
  const data = receiptToEscPos(lines, raster);
  const { char } = cached;
  for (let i = 0; i < data.length; i += 180) {
    const chunk = data.slice(i, i + 180);
    if (char.properties.writeWithoutResponse && char.writeValueWithoutResponse) await char.writeValueWithoutResponse(chunk);
    else await char.writeValue(chunk);
    await new Promise((r) => setTimeout(r, 20));
  }
  return cached.device.name ?? "printer";
}

export default function ReceiptActions({
  saleId,
  lines,
  auto,
  logo,
}: {
  saleId: number;
  lines: ReceiptLine[];
  auto: boolean;
  logo: { url: string; dots: number } | null;
}) {
  const { t } = useT();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [auto]);

  async function bluetooth() {
    setBusy(true);
    setStatus(null);
    try {
      const name = await printBluetooth(lines, logo);
      setStatus({ ok: true, text: t("Terkirim ke {name}.", { name }) });
    } catch (e) {
      cached = null;
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ ok: false, text: /cancel/i.test(msg) ? t("Pemilihan printer dibatalkan.") : t(msg) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 print:hidden">
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn" onClick={() => window.print()}>
          {t("Cetak")}
        </button>
        <button type="button" className="btn-secondary" onClick={bluetooth} disabled={busy}>
          {busy ? t("Mengirim...") : t("Cetak ke printer Bluetooth")}
        </button>
        <Link href="/kasir" className="btn-secondary">
          {t("Penjualan baru")}
        </Link>
        <Link href={`/penjualan/${saleId}`} className="btn-secondary">
          {t("Detail nota")}
        </Link>
      </div>
      {status && <p className={`mt-2 text-center text-sm ${status.ok ? "text-green-700" : "text-red-700"}`}>{status.text}</p>}
      <p className="mt-2 text-center text-xs text-neutral-500">
        <b>{t("Cetak")}</b>: {t('untuk printer yang sudah terpasang di laptop/HP (USB, atau Bluetooth lewat aplikasi seperti RawBT). Pilih ukuran kertas 58/80 mm dan margin "None".')}{" "}
        <b>Bluetooth</b>: {t("langsung ke printer thermal dari Chrome Android/laptop.")}
      </p>
    </div>
  );
}
