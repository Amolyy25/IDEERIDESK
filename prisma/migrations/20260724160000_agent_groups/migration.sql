-- AlterTable
ALTER TABLE "ticket_statuses" ADD COLUMN     "isInProgressDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#71717a',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AgentToGroup" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AgentToGroup_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_GroupToTicketCategory" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GroupToTicketCategory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_key" ON "groups"("name");

-- CreateIndex
CREATE INDEX "_AgentToGroup_B_index" ON "_AgentToGroup"("B");

-- CreateIndex
CREATE INDEX "_GroupToTicketCategory_B_index" ON "_GroupToTicketCategory"("B");

-- AddForeignKey
ALTER TABLE "_AgentToGroup" ADD CONSTRAINT "_AgentToGroup_A_fkey" FOREIGN KEY ("A") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentToGroup" ADD CONSTRAINT "_AgentToGroup_B_fkey" FOREIGN KEY ("B") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToTicketCategory" ADD CONSTRAINT "_GroupToTicketCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToTicketCategory" ADD CONSTRAINT "_GroupToTicketCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "ticket_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

