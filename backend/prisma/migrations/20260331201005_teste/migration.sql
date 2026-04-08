/*
  Warnings:

  - The values [NO_SHOW] on the enum `QueueStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [ALUNO] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `subject` on the `MonitorSubject` table. All the data in the column will be lost.
  - You are about to drop the `Attendance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AttendanceModule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Feedback` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `QueueEntryModule` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[socketId]` on the table `MonitorSession` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[monitorId,subjectId]` on the table `MonitorSubject` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[institutionId,title]` on the table `Monitoria` will be added. If there are existing duplicate values, this will fail.
  - Made the column `socketId` on table `MonitorSession` required. This step will fail if there are existing NULL values in that column.
  - Made the column `lastSeenAt` on table `MonitorSession` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `subjectId` to the `MonitorSubject` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "QueueStatus_new" AS ENUM ('WAITING', 'CALLED', 'IN_SERVICE', 'FINISHED', 'CANCELLED');
ALTER TABLE "QueueEntry" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "QueueEntry" ALTER COLUMN "status" TYPE "QueueStatus_new" USING ("status"::text::"QueueStatus_new");
ALTER TYPE "QueueStatus" RENAME TO "QueueStatus_old";
ALTER TYPE "QueueStatus_new" RENAME TO "QueueStatus";
DROP TYPE "QueueStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'COORDINATOR', 'MONITOR', 'STUDENT');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_monitorId_fkey";

-- DropForeignKey
ALTER TABLE "AttendanceModule" DROP CONSTRAINT "AttendanceModule_attendanceId_fkey";

-- DropForeignKey
ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_attendanceId_fkey";

-- DropForeignKey
ALTER TABLE "QueueEntryModule" DROP CONSTRAINT "QueueEntryModule_queueEntryId_fkey";

-- DropIndex
DROP INDEX "MonitorSession_institutionId_isOnline_idx";

-- DropIndex
DROP INDEX "MonitorSession_monitoriaId_isOnline_idx";

-- DropIndex
DROP INDEX "MonitorSubject_monitorId_subject_key";

-- DropIndex
DROP INDEX "QueueEntry_institutionId_monitoriaId_createdAt_idx";

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MonitorSession" ALTER COLUMN "socketId" SET NOT NULL,
ALTER COLUMN "lastSeenAt" SET NOT NULL,
ALTER COLUMN "lastSeenAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "MonitorSubject" DROP COLUMN "subject",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "subjectId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "QueueEntry" ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "email" DROP NOT NULL;

-- DropTable
DROP TABLE "Attendance";

-- DropTable
DROP TABLE "AttendanceModule";

-- DropTable
DROP TABLE "Feedback";

-- DropTable
DROP TABLE "QueueEntryModule";

-- DropEnum
DROP TYPE "MonitorStatus";

-- CreateIndex
CREATE INDEX "Institution_slug_idx" ON "Institution"("slug");

-- CreateIndex
CREATE INDEX "Module_subjectId_idx" ON "Module"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorSession_socketId_key" ON "MonitorSession"("socketId");

-- CreateIndex
CREATE INDEX "MonitorSession_isOnline_idx" ON "MonitorSession"("isOnline");

-- CreateIndex
CREATE INDEX "MonitorSession_monitorId_isOnline_idx" ON "MonitorSession"("monitorId", "isOnline");

-- CreateIndex
CREATE INDEX "MonitorSubject_monitorId_idx" ON "MonitorSubject"("monitorId");

-- CreateIndex
CREATE INDEX "MonitorSubject_subjectId_idx" ON "MonitorSubject"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorSubject_monitorId_subjectId_key" ON "MonitorSubject"("monitorId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Monitoria_institutionId_title_key" ON "Monitoria"("institutionId", "title");

-- CreateIndex
CREATE INDEX "QueueEntry_subjectId_idx" ON "QueueEntry"("subjectId");

-- CreateIndex
CREATE INDEX "QueueEntry_moduleId_idx" ON "QueueEntry"("moduleId");

-- CreateIndex
CREATE INDEX "QueueEntry_status_idx" ON "QueueEntry"("status");

-- CreateIndex
CREATE INDEX "QueueEntry_institutionId_status_idx" ON "QueueEntry"("institutionId", "status");

-- CreateIndex
CREATE INDEX "Subject_name_idx" ON "Subject"("name");

-- CreateIndex
CREATE INDEX "Topic_moduleId_idx" ON "Topic"("moduleId");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- AddForeignKey
ALTER TABLE "MonitorSubject" ADD CONSTRAINT "MonitorSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
