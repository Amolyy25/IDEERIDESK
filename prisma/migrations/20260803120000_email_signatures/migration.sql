-- CreateEnum
CREATE TYPE "SignatureScope" AS ENUM ('ALL_AGENTS', 'SPECIFIC_AGENTS');

-- CreateTable
CREATE TABLE "email_signatures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "scope" "SignatureScope" NOT NULL DEFAULT 'ALL_AGENTS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AgentToEmailSignature" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AgentToEmailSignature_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_signatures_name_key" ON "email_signatures"("name");

-- CreateIndex
CREATE INDEX "email_signatures_isActive_idx" ON "email_signatures"("isActive");

-- CreateIndex
CREATE INDEX "_AgentToEmailSignature_B_index" ON "_AgentToEmailSignature"("B");

-- AddForeignKey
ALTER TABLE "_AgentToEmailSignature" ADD CONSTRAINT "_AgentToEmailSignature_A_fkey" FOREIGN KEY ("A") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentToEmailSignature" ADD CONSTRAINT "_AgentToEmailSignature_B_fkey" FOREIGN KEY ("B") REFERENCES "email_signatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
