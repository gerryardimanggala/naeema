-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "pending" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);


-- Owner bisnis pertama (Naeema) menjadi admin platform.
UPDATE "User" SET "platformAdmin" = true
WHERE "role" = 'OWNER' AND "businessId" IN (SELECT "id" FROM "Business" WHERE "slug" = 'naeema');
