-- AlterEnum
ALTER TYPE "TicketSource" ADD VALUE 'PORTAL';

-- CreateTable
CREATE TABLE "portal_settings" (
    "id" TEXT NOT NULL,
    "introMessage" TEXT,
    "faqEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_settings_pkey" PRIMARY KEY ("id")
);

