-- CreateTable
CREATE TABLE "ProviderUsageEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "campaignId" TEXT,
    "companyId" TEXT,
    "unitCostUsd" DOUBLE PRECISION NOT NULL,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRequestCache" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderRequestCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderUsageEvent_provider_createdAt_idx" ON "ProviderUsageEvent"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderUsageEvent_campaignId_idx" ON "ProviderUsageEvent"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRequestCache_cacheKey_key" ON "ProviderRequestCache"("cacheKey");

-- CreateIndex
CREATE INDEX "ProviderRequestCache_expiresAt_idx" ON "ProviderRequestCache"("expiresAt");

