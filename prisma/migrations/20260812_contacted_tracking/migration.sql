-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "lastScanAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "contactedAt" TIMESTAMP(3),
ADD COLUMN     "engagementType" TEXT,
ADD COLUMN     "finalResponse" TEXT;

-- AlterTable
ALTER TABLE "EngagementRecommendation" ADD COLUMN     "avoidGuidance" TEXT;
