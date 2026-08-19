-- Intelligent Retrieval Assistance: purely additive. No existing table
-- loses a column, no existing row is modified.

-- CreateTable
CREATE TABLE "CommunityCandidate" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "priority" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "relatedConcepts" TEXT,
    "promptVersion" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "candidatesFound" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityCandidate_campaignId_name_key" ON "CommunityCandidate"("campaignId", "name");
CREATE INDEX "CommunityCandidate_campaignId_status_idx" ON "CommunityCandidate"("campaignId", "status");

ALTER TABLE "CommunityCandidate" ADD CONSTRAINT "CommunityCandidate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
