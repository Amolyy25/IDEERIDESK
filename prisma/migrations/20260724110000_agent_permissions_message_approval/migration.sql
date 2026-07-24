-- CreateEnum
CREATE TYPE "MessageApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "canApprove" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canRespond" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "approvalStatus" "MessageApprovalStatus",
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT;

-- CreateIndex
CREATE INDEX "messages_approvalStatus_idx" ON "messages"("approvalStatus");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

