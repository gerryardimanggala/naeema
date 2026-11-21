-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "logo" BYTEA,
ADD COLUMN     "logoAt" TIMESTAMP(3),
ADD COLUMN     "logoMime" TEXT;

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "token" TEXT NOT NULL,
    "adminId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_name_key" ON "PlatformAdmin"("name");

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Admin platform lama (akun toko dengan platformAdmin) dijadikan akun admin MG-POS dengan PIN yang sama.
INSERT INTO "PlatformAdmin" ("name", "pinHash")
SELECT DISTINCT ON ("name") "name", "pinHash" FROM "User"
WHERE "platformAdmin" = true AND "pinHash" IS NOT NULL
ORDER BY "name", "id"
ON CONFLICT ("name") DO NOTHING;
