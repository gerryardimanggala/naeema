"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReceiptLine } from "@/lib/receipt";
import { receiptToEscPos } from "@/lib/escpos";

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

async function printBluetooth(lines: ReceiptLine[]) {
  const bt = (navigator as unknown as { bluetooth?: Bluetooth }).bluetooth;
  if (!bt) throw new Error("Browser ini tidak mendukung Bluetooth. Pakai Chrome di Android atau laptop, atau tombol Cetak biasa.");
  if (!cached || !cached.device.gatt?.connected) {
    const device = cached?.device ?? (await bt.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES }));
    cached = { device, char: await findWritable(device) };
  }
  const data = receiptToEscPos(lines);
  const { char } = cached;
  for (let i = 0; i < data.length; i += 180) {
    const chunk = data.slice(i, i + 180);
    if (char.properties.writeWithoutResponse && char.writeValueWithoutResponse) await char.writeValueWithoutResponse(chunk);
    else await char.writeValue(chunk);
    await new Promise((r) => setTimeout(r, 20));
  }
  return cached.device.name ?? "printer";
}

export default function ReceiptActions({ saleId, lines, auto }: { saleId: number; lines: ReceiptLine[]; auto: boolean }) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [auto]);

  async function bluetooth() {
    setBusy(true);
    setStatus(null);
    try {
      const name = await printBluetooth(lines);
      setStatus({ ok: true, text: `Terkirim ke ${name}.` });
    } catch (e) {
      cached = null;
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ ok: false, text: /cancel/i.test(msg) ? "Pemilihan printer dibatalkan." : msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 print:hidden">
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn" onClick={() => window.print()}>
          Cetak
        </button>
        <button type="button" className="btn-secondary" onClick={bluetooth} disabled={busy}>
          {busy ? "Mengirim..." : "Cetak ke printer Bluetooth"}
        </button>
        <Link href="/kasir" className="btn-secondary">
          Penjualan baru
        </Link>
        <Link href={`/penjualan/${saleId}`} className="btn-secondary">
          Detail nota
        </Link>
      </div>
      {status && <p className={`mt-2 text-center text-sm ${status.ok ? "text-green-700" : "text-red-700"}`}>{status.text}</p>}
      <p className="mt-2 text-center text-xs text-neutral-500">
        <b>Cetak</b>: untuk printer yang sudah terpasang di laptop/HP (USB, atau Bluetooth lewat aplikasi seperti RawBT). Pilih ukuran kertas 58/80 mm dan margin &quot;None&quot;.{" "}
        <b>Bluetooth</b>: langsung ke printer thermal dari Chrome Android/laptop.
      </p>
    </div>
  );
}
