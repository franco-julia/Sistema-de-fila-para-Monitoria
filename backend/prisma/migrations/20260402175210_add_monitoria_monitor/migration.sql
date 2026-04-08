/*
  Warnings:

  - A unique constraint covering the columns `[institutionId,monitorId,subjectId]` on the table `Monitoria` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `monitorId` to the `Monitoria` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subjectId` to the `Monitoria` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Monitoria_institutionId_active_idx";

-- DropIndex
DROP INDEX "Monitoria_institutionId_idx";

-- DropIndex
DROP INDEX "Monitoria_institutionId_title_key";

-- AlterTable
ALTER TABLE "Monitoria" ADD COLUMN     "monitorId" TEXT NOT NULL,
ADD COLUMN     "subjectId" TEXT NOT NULL,
ALTER COLUMN "active" SET DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Monitoria_institutionId_monitorId_subjectId_key" ON "Monitoria"("institutionId", "monitorId", "subjectId");

-- AddForeignKey
ALTER TABLE "Monitoria" ADD CONSTRAINT "Monitoria_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monitoria" ADD CONSTRAINT "Monitoria_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
