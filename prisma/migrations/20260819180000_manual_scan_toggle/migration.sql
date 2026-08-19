-- Standalone manual-scan toggle, independent of BetaSettings.enabled.
-- Additive only: new column, default false, existing row untouched
-- besides picking up the new default.
ALTER TABLE "BetaSettings" ADD COLUMN "manualScanEnabled" BOOLEAN NOT NULL DEFAULT false;
