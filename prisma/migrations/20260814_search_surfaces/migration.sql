-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "foundBySurfaces" TEXT;

-- CreateTable
CREATE TABLE "SearchSurface" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "phrases" TEXT NOT NULL,
    "timesRun" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "conversationsFound" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchSurface_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchSurface_campaignId_idx" ON "SearchSurface"("campaignId");

-- AddForeignKey
ALTER TABLE "SearchSurface" ADD CONSTRAINT "SearchSurface_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
