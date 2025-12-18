-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "additives" JSONB,
ADD COLUMN     "cleanRecipe" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "productName" TEXT;
