-- CreateTable
CREATE TABLE "MonitorSession" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "socketId" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorSession_institutionId_isOnline_idx" ON "MonitorSession"("institutionId", "isOnline");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorSession_monitorId_key" ON "MonitorSession"("monitorId");

-- AddForeignKey
ALTER TABLE "MonitorSession" ADD CONSTRAINT "MonitorSession_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorSession" ADD CONSTRAINT "MonitorSession_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
