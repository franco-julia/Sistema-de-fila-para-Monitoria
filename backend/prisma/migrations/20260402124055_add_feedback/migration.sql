-- AlterTable
ALTER TABLE "QueueEntry" ADD COLUMN     "feedbackAt" TIMESTAMP(3),
ADD COLUMN     "feedbackComment" TEXT,
ADD COLUMN     "rating" INTEGER;
