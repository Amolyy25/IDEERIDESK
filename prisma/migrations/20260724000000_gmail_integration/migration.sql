-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "emailSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gmailMessageId" TEXT;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "emailMessageId" TEXT,
ADD COLUMN     "gmailThreadId" TEXT;

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3),
    "historyId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_email_key" ON "email_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "messages_gmailMessageId_key" ON "messages"("gmailMessageId");

-- CreateIndex
CREATE INDEX "tickets_gmailThreadId_idx" ON "tickets"("gmailThreadId");

