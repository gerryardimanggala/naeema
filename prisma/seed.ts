// Data contoh untuk uji coba. Jalankan: npm run db:seed
import { PrismaClient } from "@prisma/client";
import { hashPin } from "../src/lib/auth";

// Semua akun contoh memakai PIN 1234. Jangan dipakai di database sungguhan.
const pinHash = hashPin("1234");

const db = new PrismaClient();

async function main() {
  if (await db.business.findUnique({ where: { slug: "contoh" } })) {
    console.log('Bisnis contoh (kode toko "contoh") sudah ada, seed dilewati.');
    return;
  }
  const { id: businessId } = await db.business.create({ data: { name: "Toko Contoh Hijab", slug: "contoh" } });
  const owner = await db.user.create({ data: { businessId, name: "Pemilik", role: "OWNER", pinHash } });
  const admin = await db.user.create({ data: { businessId, name: "Admin Keuangan", role: "ADMIN", pinHash } });
  const tokoStaff = await db.user.create({ data: { businessId, name: "Staf Toko", role: "STAFF", pinHash } });
  const eventStaff = await db.user.create({ data: { businessId, name: "Tim Pameran", role: "STAFF", pinHash } });

  await db.wallet.createMany({
    data: [
      { name: "Rekening BCA", kind: "BANK", currency: "IDR" },
      { name: "Saldo Shopee", kind: "MARKETPLACE", currency: "IDR" },
      { name: "Saldo Tokopedia", kind: "MARKETPLACE", currency: "IDR" },
      { name: "Kas Admin Keuangan", kind: "PERSON", ownerId: admin.id, currency: "IDR" },
      { name: "Kas Staf Toko", kind: "PERSON", ownerId: tokoStaff.id, currency: "IDR" },
      { name: "Kas Tim Pameran (IDR)", kind: "PERSON", ownerId: eventStaff.id, currency: "IDR" },
      { name: "Kas Tim Pameran (MYR)", kind: "PERSON", ownerId: eventStaff.id, currency: "MYR" },
      { name: "Kas Tim Pameran (SGD)", kind: "PERSON", ownerId: eventStaff.id, currency: "SGD" },
      { name: "Kas Pemilik", kind: "PERSON", ownerId: owner.id, currency: "IDR" },
    ].map((w) => ({ ...w, businessId })),
  });

  const gudang = await db.location.create({ data: { businessId, name: "Gudang", type: "WAREHOUSE" } });
  await db.location.create({ data: { businessId, name: "Toko Offline", type: "STORE" } });

  // Kurs contoh. Ganti dengan kurs sebenarnya di menu Pengaturan.
  await db.exchangeRate.createMany({
    data: [
      { businessId, currency: "MYR", idrPerUnit: 3600 },
      { businessId, currency: "SGD", idrPerUnit: 12500 },
    ],
  });

  const products: { name: string; category: string; base: string; price: number; myr: number; sgd: number; variants: [string, string?][] }[] = [
    { name: "Pashmina Ceruty", category: "Hijab", base: "PSC", price: 89000, myr: 3500, sgd: 1200, variants: [["Hitam"], ["Mocca"], ["Dusty Pink"]] },
    { name: "Segi Empat Voal", category: "Hijab", base: "SEV", price: 99000, myr: 3900, sgd: 1300, variants: [["Navy"], ["Sage"]] },
    { name: "Mukena Katun Rayon", category: "Mukena", base: "MKR", price: 349000, myr: 13900, sgd: 4500, variants: [["Putih", "All size"], ["Abu", "All size"]] },
    { name: "Mukena Traveling Parasut", category: "Mukena traveling", base: "MTP", price: 229000, myr: 8900, sgd: 2900, variants: [["Hitam", "All size"], ["Maroon", "All size"]] },
    { name: "Manset Jersey", category: "Manset", base: "MSJ", price: 49000, myr: 1900, sgd: 650, variants: [["Hitam"], ["Cream"]] },
    { name: "Sleeve Lengan", category: "Sleeve", base: "SLV", price: 39000, myr: 1500, sgd: 500, variants: [["Hitam"], ["Putih"]] },
  ];
  const categoryIds = new Map<string, number>();
  for (const name of new Set(products.map((p) => p.category))) {
    categoryIds.set(name, (await db.category.create({ data: { businessId, name } })).id);
  }
  for (const p of products) {
    const prod = await db.product.create({ data: { businessId, name: p.name, categoryId: categoryIds.get(p.category)! } });
    for (const [color, size] of p.variants) {
      const v = await db.variant.create({
        data: {
          businessId,
          productId: prod.id,
          sku: `${p.base}-${color.toUpperCase().replace(/\s+/g, "").slice(0, 4)}`,
          color,
          size,
          priceIdr: p.price,
          prices: { create: [{ currency: "MYR", price: p.myr }, { currency: "SGD", price: p.sgd }] },
        },
      });
      await db.stock.create({ data: { variantId: v.id, locationId: gudang.id, qty: 50 } });
      await db.stockMove.create({ data: { businessId, type: "IN", variantId: v.id, toLocationId: gudang.id, qty: 50, note: "Stok awal (contoh)", userId: owner.id } });
    }
  }
  console.log("Seed selesai.");
}

main().finally(() => db.$disconnect());
