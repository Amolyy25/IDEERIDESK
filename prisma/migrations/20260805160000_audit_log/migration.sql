-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('TICKET_VIEWED', 'TICKET_CREATED', 'TICKET_REPLIED', 'TICKET_NOTE_ADDED', 'TICKET_UPDATED', 'TICKET_CLAIMED', 'TICKET_CLOSED', 'TICKET_DELETED', 'TICKET_MERGED', 'TICKET_UNMERGED', 'REPLY_APPROVED', 'REPLY_REJECTED');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "ticketId" TEXT,
    "ticketNumber" INTEGER,
    "ticketSubject" TEXT,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_ticketId_createdAt_idx" ON "audit_logs"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
