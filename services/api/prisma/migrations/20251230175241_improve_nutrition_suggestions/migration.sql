/*
  Warnings:

  - Added the required column `confidence` to the `NutritionLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `explanation` to the `NutritionLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `servingSize` to the `NutritionLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "NutritionLog" ADD COLUMN     "confidence" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "explanation" TEXT NOT NULL,
ADD COLUMN     "servingSize" TEXT NOT NULL,
ADD COLUMN     "suggestions" TEXT[];
