-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "discoveryOfferHash" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "foundByTerms" TEXT;

-- AlterTable
ALTER TABLE "ScanRun" ADD COLUMN "discoveryTermsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DiscoveryTerm" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "candidatesFound" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryTermRun" (
    "id" TEXT NOT NULL,
    "scanRunId" TEXT NOT NULL,
    "termIds" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "rawCount" INTEGER NOT NULL DEFAULT 0,
    "keptCount" INTEGER NOT NULL DEFAULT 0,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryTermRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveryTerm_campaignId_active_idx" ON "DiscoveryTerm"("campaignId", "active");

-- CreateIndex
CREATE INDEX "DiscoveryTermRun_scanRunId_idx" ON "DiscoveryTermRun"("scanRunId");

-- AddForeignKey
ALTER TABLE "DiscoveryTerm" ADD CONSTRAINT "DiscoveryTerm_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryTermRun" ADD CONSTRAINT "DiscoveryTermRun_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "ScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
