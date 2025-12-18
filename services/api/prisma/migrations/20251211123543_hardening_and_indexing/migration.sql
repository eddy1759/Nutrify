-- AlterTable
ALTER TABLE "ProductScan" ADD COLUMN     "estimatedShelfLife" TEXT;

-- CreateIndex
CREATE INDEX "ProductScan_userId_idx" ON "ProductScan"("userId");

-- CreateIndex
CREATE INDEX "ProductScan_createdAt_idx" ON "ProductScan"("createdAt");

-- CreateIndex
CREATE INDEX "ProductScan_novaScore_idx" ON "ProductScan"("novaScore");
