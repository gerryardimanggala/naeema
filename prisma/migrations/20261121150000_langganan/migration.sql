-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "freePlan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paidUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "adminId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionPayment_businessId_idx" ON "SubscriptionPayment"("businessId");

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Toko milik pengelola (Naeema) gratis. Toko lain yang sudah ada mendapat 30 hari sebelum perlu membayar.
UPDATE "Business" SET "freePlan" = true WHERE "slug" = 'naeema';
UPDATE "Business" SET "paidUntil" = NOW() + INTERVAL '30 days' WHERE "slug" <> 'naeema' AND "paidUntil" IS NULL;
