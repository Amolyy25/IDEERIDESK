-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT';

-- AlterTable
ALTER TABLE "ticket_statuses" ADD COLUMN     "isReopenDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "messageId" TEXT;

-- CreateIndex
CREATE INDEX "attachments_messageId_idx" ON "attachments"("messageId");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
