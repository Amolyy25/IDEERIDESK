-- CreateEnum
CREATE TYPE "CannedResponseDimension" AS ENUM ('CATEGORY', 'SOURCE', 'PRIORITY', 'STATUS');

-- CreateTable
CREATE TABLE "canned_responses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canned_response_filters" (
    "id" TEXT NOT NULL,
    "dimension" "CannedResponseDimension" NOT NULL,
    "valueId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,

    CONSTRAINT "canned_response_filters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canned_responses_title_key" ON "canned_responses"("title");

-- CreateIndex
CREATE INDEX "canned_responses_isActive_idx" ON "canned_responses"("isActive");

-- CreateIndex
CREATE INDEX "canned_response_filters_responseId_idx" ON "canned_response_filters"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "canned_response_filters_responseId_dimension_valueId_key" ON "canned_response_filters"("responseId", "dimension", "valueId");

-- AddForeignKey
ALTER TABLE "canned_response_filters" ADD CONSTRAINT "canned_response_filters_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "canned_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
