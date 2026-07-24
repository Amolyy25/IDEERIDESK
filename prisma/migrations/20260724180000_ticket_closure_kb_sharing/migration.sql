-- CreateEnum
CREATE TYPE "KnowledgeShareScope" AS ENUM ('PUBLIC', 'INTERNAL');

-- AlterTable
ALTER TABLE "knowledge_articles" ADD COLUMN     "shareScope" "KnowledgeShareScope",
ADD COLUMN     "shareToken" TEXT;

-- AlterTable
ALTER TABLE "ticket_statuses" ADD COLUMN     "isCloseDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ticket_closure_template" (
    "id" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_closure_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_images" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_article_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_shareToken_key" ON "knowledge_articles"("shareToken");

