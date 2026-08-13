-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "lastScanCacheHit" BOOLEAN,
ADD COLUMN     "lastScanIngested" INTEGER,
ADD COLUMN     "lastScanOpportunities" INTEGER,
ADD COLUMN     "lastScanSkippedDuplicates" INTEGER,
ADD COLUMN     "lastScanSkippedJunk" INTEGER;
