-- Beta Mode / Controlled Manual Scanning: purely additive. No existing
-- table loses a column, no existing row is modified.

-- AlterTable: ScanRun gains trigger/triggeredByUserId so a beta-triggered
-- manual scan is distinguishable from the normal daily-cron scan using the
-- same ledger the engine already writes, without duplicating it. Existing
-- rows default to "cron", which is accurate — every scan before this
-- migration was cron- or pre-beta-manual-triggered.
ALTER TABLE "ScanRun" ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'cron';
ALTER TABLE "ScanRun" ADD COLUMN "triggeredByUserId" TEXT;
CREATE INDEX "ScanRun_trigger_startedAt_idx" ON "ScanRun"("trigger", "startedAt");

-- CreateTable: BetaSettings — a single admin-controlled row, always
-- addressed by the fixed id 'singleton' (see lib/beta.ts). Seeded here so
-- application code can always assume the row exists (findUniqueOrThrow),
-- no lazy-create race to handle.
CREATE TABLE "BetaSettings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "manualScansPerUserPerDay" INTEGER NOT NULL DEFAULT 2,
    "scanningPaused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByEmail" TEXT,

    CONSTRAINT "BetaSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BetaSettings" ("id", "enabled", "manualScansPerUserPerDay", "scanningPaused", "updatedAt")
VALUES ('singleton', false, 2, false, CURRENT_TIMESTAMP);

-- CreateTable: BetaScanUsage — one row per (userId, UTC day), claimed
-- atomically via INSERT ... ON CONFLICT ... WHERE count < limit (see
-- lib/beta.ts's claimBetaScanAllowance), the same single-conditional-write
-- pattern lib/dailyScan.ts already uses for campaign claim locking.
CREATE TABLE "BetaScanUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetaScanUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BetaScanUsage_userId_day_key" ON "BetaScanUsage"("userId", "day");
ALTER TABLE "BetaScanUsage" ADD CONSTRAINT "BetaScanUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
