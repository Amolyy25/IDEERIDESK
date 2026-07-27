-- CreateTable
CREATE TABLE "ticket_acknowledgement_template" (
    "id" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_acknowledgement_template_pkey" PRIMARY KEY ("id")
);
