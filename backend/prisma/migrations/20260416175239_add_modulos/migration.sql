-- CreateTable
CREATE TABLE "QueueEntryModule" (
    "id" TEXT NOT NULL,
    "queueEntryId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueEntryModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueueEntryModule_queueEntryId_idx" ON "QueueEntryModule"("queueEntryId");

-- CreateIndex
CREATE INDEX "QueueEntryModule_moduleId_idx" ON "QueueEntryModule"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueEntryModule_queueEntryId_moduleId_key" ON "QueueEntryModule"("queueEntryId", "moduleId");

-- AddForeignKey
ALTER TABLE "QueueEntryModule" ADD CONSTRAINT "QueueEntryModule_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "QueueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntryModule" ADD CONSTRAINT "QueueEntryModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
