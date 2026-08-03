-- CreateTable
CREATE TABLE "email_layout_template" (
    "id" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_layout_template_pkey" PRIMARY KEY ("id")
);
