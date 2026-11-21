-- Multi-bisnis: setiap data milik satu bisnis.
-- Data yang sudah ada (jika ada) dipindahkan ke bisnis pertama "Naeema" (kode toko: naeema).

CREATE TABLE "Business" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Category_businessId_name_key" ON "Category"("businessId", "name");

INSERT INTO "Business" ("name", "slug")
SELECT 'Naeema Hijab', 'naeema' WHERE EXISTS (SELECT 1 FROM "User");

ALTER TABLE "User" ADD COLUMN "businessId" INTEGER;
UPDATE "User" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "User" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN "businessId" INTEGER;
UPDATE "Product" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "Product" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Variant" ADD COLUMN "businessId" INTEGER;
UPDATE "Variant" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "Variant" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Event" ADD COLUMN "businessId" INTEGER;
UPDATE "Event" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "Event" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Event" ADD CONSTRAINT "Event_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Location" ADD COLUMN "businessId" INTEGER;
UPDATE "Location" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "Location" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Location" ADD CONSTRAINT "Location_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMove" ADD COLUMN "businessId" INTEGER;
UPDATE "StockMove" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "StockMove" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD COLUMN "businessId" INTEGER;
UPDATE "Sale" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "Sale" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Wallet" ADD COLUMN "businessId" INTEGER;
UPDATE "Wallet" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "Wallet" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashMove" ADD COLUMN "businessId" INTEGER;
UPDATE "CashMove" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "CashMove" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "CashMove" ADD CONSTRAINT "CashMove_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExchangeRate" ADD COLUMN "businessId" INTEGER;
UPDATE "ExchangeRate" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "ExchangeRate" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Setting" ADD COLUMN "businessId" INTEGER;
UPDATE "Setting" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "Setting" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentQr" ADD COLUMN "businessId" INTEGER;
UPDATE "PaymentQr" SET "businessId" = (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
ALTER TABLE "PaymentQr" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "PaymentQr" ADD CONSTRAINT "PaymentQr_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Kategori produk: dari kode tetap menjadi data per bisnis.
INSERT INTO "Category" ("businessId", "name")
SELECT DISTINCT "businessId",
  CASE "category"
    WHEN 'HIJAB' THEN 'Hijab'
    WHEN 'MUKENA' THEN 'Mukena'
    WHEN 'MUKENA_TRAVELING' THEN 'Mukena traveling'
    WHEN 'MANSET' THEN 'Manset'
    WHEN 'SLEEVE' THEN 'Sleeve'
    ELSE 'Lainnya'
  END
FROM "Product";

ALTER TABLE "Product" ADD COLUMN "categoryId" INTEGER;
UPDATE "Product" p SET "categoryId" = c."id"
FROM "Category" c
WHERE c."businessId" = p."businessId" AND c."name" = CASE p."category"
    WHEN 'HIJAB' THEN 'Hijab'
    WHEN 'MUKENA' THEN 'Mukena'
    WHEN 'MUKENA_TRAVELING' THEN 'Mukena traveling'
    WHEN 'MANSET' THEN 'Manset'
    WHEN 'SLEEVE' THEN 'Sleeve'
    ELSE 'Lainnya'
  END;
ALTER TABLE "Product" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "Product" DROP COLUMN "category";
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keunikan sekarang per bisnis.
DROP INDEX "Sale_number_key";
DROP INDEX "Variant_sku_key";
CREATE UNIQUE INDEX "Sale_businessId_number_key" ON "Sale"("businessId", "number");
CREATE UNIQUE INDEX "Variant_businessId_sku_key" ON "Variant"("businessId", "sku");
ALTER TABLE "Setting" DROP CONSTRAINT "Setting_pkey";
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_pkey" PRIMARY KEY ("businessId", "key");

CREATE INDEX "CashMove_businessId_idx" ON "CashMove"("businessId");
CREATE INDEX "Event_businessId_idx" ON "Event"("businessId");
CREATE INDEX "ExchangeRate_businessId_idx" ON "ExchangeRate"("businessId");
CREATE INDEX "Location_businessId_idx" ON "Location"("businessId");
CREATE INDEX "PaymentQr_businessId_idx" ON "PaymentQr"("businessId");
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "StockMove_businessId_idx" ON "StockMove"("businessId");
CREATE INDEX "User_businessId_idx" ON "User"("businessId");
CREATE INDEX "Wallet_businessId_idx" ON "Wallet"("businessId");
