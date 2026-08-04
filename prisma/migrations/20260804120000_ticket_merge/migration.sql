-- CreateEnum
CREATE TYPE "DuplicateSuggestionStatus" AS ENUM ('PENDING', 'DISMISSED', 'MERGED');

-- AlterTable
ALTER TABLE "tickets"
  ADD COLUMN "mergedIntoId" TEXT,
  ADD COLUMN "mergedAt" TIMESTAMP(3),
  ADD COLUMN "duplicateScanAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tickets_mergedIntoId_idx" ON "tickets"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_mergedIntoId_fkey"
  FOREIGN KEY ("mergedIntoId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ticket_duplicate_suggestions" (
    "id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DuplicateSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "ticketId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,

    CONSTRAINT "ticket_duplicate_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_duplicate_suggestions_ticketId_candidateId_key"
  ON "ticket_duplicate_suggestions"("ticketId", "candidateId");

-- CreateIndex
CREATE INDEX "ticket_duplicate_suggestions_ticketId_status_idx"
  ON "ticket_duplicate_suggestions"("ticketId", "status");

-- AddForeignKey
ALTER TABLE "ticket_duplicate_suggestions" ADD CONSTRAINT "ticket_duplicate_suggestions_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_duplicate_suggestions" ADD CONSTRAINT "ticket_duplicate_suggestions_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
