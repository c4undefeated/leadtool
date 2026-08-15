-- CreateTable
CREATE TABLE "XDiscoveryPhrase" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
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

    CONSTRAINT "XDiscoveryPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XDiscoveryPhrase_campaignId_active_idx" ON "XDiscoveryPhrase"("campaignId", "active");

-- AddForeignKey
ALTER TABLE "XDiscoveryPhrase" ADD CONSTRAINT "XDiscoveryPhrase_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
