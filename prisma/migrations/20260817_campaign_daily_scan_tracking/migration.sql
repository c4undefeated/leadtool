-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "lastScanStartedAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "lastScanStatus" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "lastScanError" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "scanLockedAt" TIMESTAMP(3);
