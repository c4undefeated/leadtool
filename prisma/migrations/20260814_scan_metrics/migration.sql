-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "rawProviderResults" INTEGER NOT NULL DEFAULT 0,
    "uniqueConversations" INTEGER NOT NULL DEFAULT 0,
    "skippedJunk" INTEGER NOT NULL DEFAULT 0,
    "skippedDuplicates" INTEGER NOT NULL DEFAULT 0,
    "aiAnalyzedCount" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesCreated" INTEGER NOT NULL DEFAULT 0,
    "providerCalls" INTEGER NOT NULL DEFAULT 0,
    "providerCacheHits" INTEGER NOT NULL DEFAULT 0,
    "providerSpendUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "providerErrors" INTEGER NOT NULL DEFAULT 0,
    "aiErrors" INTEGER NOT NULL DEFAULT 0,
    "notConfigured" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchSurfaceRun" (
    "id" TEXT NOT NULL,
    "scanRunId" TEXT NOT NULL,
    "searchSurfaceId" TEXT,
    "family" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "rawCount" INTEGER NOT NULL DEFAULT 0,
    "keptCount" INTEGER NOT NULL DEFAULT 0,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchSurfaceRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanRun_campaignId_startedAt_idx" ON "ScanRun"("campaignId", "startedAt");

-- CreateIndex
CREATE INDEX "SearchSurfaceRun_scanRunId_idx" ON "SearchSurfaceRun"("scanRunId");

-- CreateIndex
CREATE INDEX "SearchSurfaceRun_searchSurfaceId_idx" ON "SearchSurfaceRun"("searchSurfaceId");

-- AddForeignKey
ALTER TABLE "ScanRun" ADD CONSTRAINT "ScanRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchSurfaceRun" ADD CONSTRAINT "SearchSurfaceRun_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "ScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchSurfaceRun" ADD CONSTRAINT "SearchSurfaceRun_searchSurfaceId_fkey" FOREIGN KEY ("searchSurfaceId") REFERENCES "SearchSurface"("id") ON DELETE CASCADE ON UPDATE CASCADE;
