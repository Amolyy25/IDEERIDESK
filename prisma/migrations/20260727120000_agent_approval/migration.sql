-- CreateEnum
CREATE TYPE "AgentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "approvalStatus" "AgentApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "approvalDecidedAt" TIMESTAMP(3),
ADD COLUMN     "approvalDecidedById" TEXT;

-- Les comptes déjà créés avant le workflow d'approbation sont considérés comme
-- approuvés : sans ça, tout le monde (admins compris) serait mis en attente.
UPDATE "agents" SET "approvalStatus" = 'APPROVED', "approvalDecidedAt" = NOW();

-- CreateIndex
CREATE INDEX "agents_approvalStatus_idx" ON "agents"("approvalStatus");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_approvalDecidedById_fkey" FOREIGN KEY ("approvalDecidedById") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
