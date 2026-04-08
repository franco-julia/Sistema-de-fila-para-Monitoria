/*
  Warnings:

  - The values [IN_QUEUE,IN_ATTENDANCE] on the enum `QueueStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `arrivalDeadlineAt` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the column `arrivedAt` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the column `attendanceEndAt` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the column `attendanceStartAt` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the column `externalStudentId` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the column `joinedAt` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the column `monitorId` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the column `studentClass` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the column `studentName` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the column `studentPhone` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the column `subject` on the `QueueEntry` table. All the data in the column will be lost.
  - You are about to drop the `Monitor` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Institution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monitoriaId` to the `MonitorSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monitoriaId` to the `QueueEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `studentId` to the `QueueEntry` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MONITOR', 'ALUNO');

-- AlterEnum
BEGIN;
CREATE TYPE "QueueStatus_new" AS ENUM ('WAITING', 'CALLED', 'IN_SERVICE', 'FINISHED', 'NO_SHOW', 'CANCELLED');
ALTER TABLE "QueueEntry" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "QueueEntry" ALTER COLUMN "status" TYPE "QueueStatus_new" USING ("status"::text::"QueueStatus_new");
ALTER TYPE "QueueStatus" RENAME TO "QueueStatus_old";
ALTER TYPE "QueueStatus_new" RENAME TO "QueueStatus";
DROP TYPE "QueueStatus_old";
ALTER TABLE "QueueEntry" ALTER COLUMN "status" SET DEFAULT 'WAITING';
COMMIT;

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_monitorId_fkey";

-- DropForeignKey
ALTER TABLE "Monitor" DROP CONSTRAINT "Monitor_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "MonitorSession" DROP CONSTRAINT "MonitorSession_monitorId_fkey";

-- DropForeignKey
ALTER TABLE "MonitorSubject" DROP CONSTRAINT "MonitorSubject_monitorId_fkey";

-- DropForeignKey
ALTER TABLE "QueueEntry" DROP CONSTRAINT "QueueEntry_monitorId_fkey";

-- DropIndex
DROP INDEX "MonitorSession_monitorId_key";

-- DropIndex
DROP INDEX "QueueEntry_institutionId_status_idx";

-- DropIndex
DROP INDEX "QueueEntry_monitorId_status_idx";

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "MonitorSession" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "monitoriaId" TEXT NOT NULL,
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "isOnline" SET DEFAULT true,
ALTER COLUMN "lastSeenAt" DROP NOT NULL,
ALTER COLUMN "lastSeenAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "QueueEntry" DROP COLUMN "arrivalDeadlineAt",
DROP COLUMN "arrivedAt",
DROP COLUMN "attendanceEndAt",
DROP COLUMN "attendanceStartAt",
DROP COLUMN "externalStudentId",
DROP COLUMN "joinedAt",
DROP COLUMN "monitorId",
DROP COLUMN "studentClass",
DROP COLUMN "studentName",
DROP COLUMN "studentPhone",
DROP COLUMN "subject",
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "monitoriaId" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "studentId" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'WAITING';

-- DropTable
DROP TABLE "Monitor";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "institutionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Monitoria" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "institutionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Monitoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_institutionId_idx" ON "User"("institutionId");

-- CreateIndex
CREATE INDEX "User_institutionId_role_idx" ON "User"("institutionId", "role");

-- CreateIndex
CREATE INDEX "Monitoria_institutionId_idx" ON "Monitoria"("institutionId");

-- CreateIndex
CREATE INDEX "Monitoria_institutionId_active_idx" ON "Monitoria"("institutionId", "active");

-- CreateIndex
CREATE INDEX "MonitorSession_institutionId_idx" ON "MonitorSession"("institutionId");

-- CreateIndex
CREATE INDEX "MonitorSession_monitorId_idx" ON "MonitorSession"("monitorId");

-- CreateIndex
CREATE INDEX "MonitorSession_monitoriaId_idx" ON "MonitorSession"("monitoriaId");

-- CreateIndex
CREATE INDEX "MonitorSession_monitoriaId_isOnline_idx" ON "MonitorSession"("monitoriaId", "isOnline");

-- CreateIndex
CREATE INDEX "QueueEntry_institutionId_idx" ON "QueueEntry"("institutionId");

-- CreateIndex
CREATE INDEX "QueueEntry_monitoriaId_idx" ON "QueueEntry"("monitoriaId");

-- CreateIndex
CREATE INDEX "QueueEntry_studentId_idx" ON "QueueEntry"("studentId");

-- CreateIndex
CREATE INDEX "QueueEntry_institutionId_monitoriaId_status_idx" ON "QueueEntry"("institutionId", "monitoriaId", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_institutionId_monitoriaId_createdAt_idx" ON "QueueEntry"("institutionId", "monitoriaId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monitoria" ADD CONSTRAINT "Monitoria_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorSubject" ADD CONSTRAINT "MonitorSubject_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_monitoriaId_fkey" FOREIGN KEY ("monitoriaId") REFERENCES "Monitoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorSession" ADD CONSTRAINT "MonitorSession_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorSession" ADD CONSTRAINT "MonitorSession_monitoriaId_fkey" FOREIGN KEY ("monitoriaId") REFERENCES "Monitoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
