-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "analyzedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ScanRun" ADD COLUMN "searchesPlanned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScanRun" ADD COLUMN "searchesSkippedBudget" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScanRun" ADD COLUMN "candidatesCarriedOver" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Conversation_campaignId_analyzedAt_idx" ON "Conversation"("campaignId", "analyzedAt");
