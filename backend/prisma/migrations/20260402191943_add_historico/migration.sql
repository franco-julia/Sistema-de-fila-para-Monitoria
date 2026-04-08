-- CreateTable
CREATE TABLE "AttendanceHistory" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "studentId" TEXT,
    "queueEntryId" TEXT,
    "subjectId" TEXT,
    "studentName" TEXT NOT NULL,
    "studentPhone" TEXT,
    "subjectName" TEXT,
    "moduleNames" TEXT[],
    "statusFinal" TEXT NOT NULL,
    "enteredQueueAt" TIMESTAMP(3),
    "calledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "waitSeconds" INTEGER,
    "serviceSeconds" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AttendanceHistory" ADD CONSTRAINT "AttendanceHistory_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceHistory" ADD CONSTRAINT "AttendanceHistory_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
