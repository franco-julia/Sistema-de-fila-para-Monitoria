-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('AVAILABLE', 'PAUSED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('IN_QUEUE', 'CALLED', 'IN_ATTENDANCE', 'FINISHED', 'NO_SHOW', 'CANCELLED');

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Monitor" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "MonitorStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Monitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorSubject" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,

    CONSTRAINT "MonitorSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "externalStudentId" TEXT,
    "studentName" TEXT NOT NULL,
    "studentPhone" TEXT NOT NULL,
    "studentClass" TEXT,
    "subject" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'IN_QUEUE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "arrivalDeadlineAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "attendanceStartAt" TIMESTAMP(3),
    "attendanceEndAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueEntryModule" (
    "id" TEXT NOT NULL,
    "queueEntryId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "QueueEntryModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "queueEntryId" TEXT,
    "externalStudentId" TEXT,
    "studentName" TEXT NOT NULL,
    "studentPhone" TEXT NOT NULL,
    "studentClass" TEXT,
    "subject" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceModule" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "AttendanceModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_slug_key" ON "Institution"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Monitor_institutionId_username_key" ON "Monitor"("institutionId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorSubject_monitorId_subject_key" ON "MonitorSubject"("monitorId", "subject");

-- CreateIndex
CREATE INDEX "QueueEntry_institutionId_status_idx" ON "QueueEntry"("institutionId", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_monitorId_status_idx" ON "QueueEntry"("monitorId", "status");

-- CreateIndex
CREATE INDEX "Attendance_institutionId_createdAt_idx" ON "Attendance"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "Attendance_monitorId_createdAt_idx" ON "Attendance"("monitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_attendanceId_key" ON "Feedback"("attendanceId");

-- AddForeignKey
ALTER TABLE "Monitor" ADD CONSTRAINT "Monitor_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorSubject" ADD CONSTRAINT "MonitorSubject_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntryModule" ADD CONSTRAINT "QueueEntryModule_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "QueueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceModule" ADD CONSTRAINT "AttendanceModule_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
