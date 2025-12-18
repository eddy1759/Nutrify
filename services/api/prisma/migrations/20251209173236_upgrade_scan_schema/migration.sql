/*
  Warnings:

  - You are about to drop the `Scan` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Scan" DROP CONSTRAINT "Scan_userId_fkey";

-- DropTable
DROP TABLE "Scan";

-- CreateTable
CREATE TABLE "ProductScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "rawText" TEXT NOT NULL,
    "productName" TEXT,
    "novaScore" INTEGER NOT NULL,
    "additives" JSONB,
    "cleanRecipe" TEXT,
    "ocrConfidence" DOUBLE PRECISION,
    "mlConfidence" DOUBLE PRECISION,
    "functionalCategories" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductScan_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProductScan" ADD CONSTRAINT "ProductScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
