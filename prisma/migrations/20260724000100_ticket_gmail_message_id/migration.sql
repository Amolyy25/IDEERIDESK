-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "gmailMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tickets_gmailMessageId_key" ON "tickets"("gmailMessageId");

