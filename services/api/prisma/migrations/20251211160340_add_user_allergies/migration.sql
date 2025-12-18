-- AlterTable
ALTER TABLE "ProductScan" ADD COLUMN     "allergenAlert" TEXT,
ADD COLUMN     "isSafe" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allergies" TEXT[];
