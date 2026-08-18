import { prisma } from "@/lib/prisma";

const SCAN_RUN_HISTORY_LIMIT = 50;
// runDailyScan() (lib/dailyScan.ts) never persists one row per cron
// invocation — only per-campaign fields and per-campaign ScanRun rows.
// This reconstructs "the latest cron batch" by grouping ScanRun rows that
// started within a few minutes of the most recent one, since a single
// runDailyScan() call kicks all of that run's campaigns off together
// (bounded concurrency, same invocation). Deliberately read-only and
// additive — does not touch lib/dailyScan.ts's write path or the proven
// claim/lease logic at all. Labeled clearly as an approximation wherever
// it's shown.
const BATCH_WINDOW_MS = 3 * 60 * 1000;

export type ScanRunHistoryRow = {
  id: string;
  campaignId: string;
  campaignName: string;
  companyName: string;
  sourceType: string;
  startedAt: Date;
  durationMs: number | null;
  conversationsIngested: number;
  opportunitiesCreated: number;
  providerErrors: number;
  aiErrors: number;
  notConfigured: boolean;
};

export async function getScanRunHistory(limit = SCAN_RUN_HISTORY_LIMIT): Promise<ScanRunHistoryRow[]> {
  const runs = await prisma.scanRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      startedAt: true,
      durationMs: true,
      uniqueConversations: true,
      opportunitiesCreated: true,
      providerErrors: true,
      aiErrors: true,
      notConfigured: true,
      campaign: { select: { id: true, name: true, sourceType: true, company: { select: { name: true } } } },
    },
  });

  return runs.map((r) => ({
    id: r.id,
    campaignId: r.campaign.id,
    campaignName: r.campaign.name,
    companyName: r.campaign.company.name,
    sourceType: r.campaign.sourceType,
    startedAt: r.startedAt,
    durationMs: r.durationMs,
    conversationsIngested: r.uniqueConversations,
    opportunitiesCreated: r.opportunitiesCreated,
    providerErrors: r.providerErrors,
    aiErrors: r.aiErrors,
    notConfigured: r.notConfigured,
  }));
}

export type LatestCronBatch = {
  windowStart: Date;
  scansAttempted: number;
  opportunitiesCreated: number;
  totalDurationMs: number;
  failedCount: number;
};

/** Best-effort grouping of the most recent ScanRun rows into "the latest cron invocation" — see the module doc comment above. */
export function reconstructLatestBatch(history: ScanRunHistoryRow[]): LatestCronBatch | null {
  if (history.length === 0) return null;
  const mostRecent = history[0]!.startedAt.getTime();
  const batch = history.filter((r) => mostRecent - r.startedAt.getTime() <= BATCH_WINDOW_MS);
  return {
    windowStart: new Date(Math.min(...batch.map((r) => r.startedAt.getTime()))),
    scansAttempted: batch.length,
    opportunitiesCreated: batch.reduce((sum, r) => sum + r.opportunitiesCreated, 0),
    totalDurationMs: batch.reduce((sum, r) => sum + (r.durationMs ?? 0), 0),
    failedCount: batch.filter((r) => r.providerErrors > 0 || r.notConfigured).length,
  };
}

export type CampaignScanStatusRow = {
  id: string;
  name: string;
  companyName: string;
  sourceType: string;
  status: string;
  lastScanAt: Date | null;
  lastScanStatus: string | null;
  lastScanError: string | null;
  scanLockedAt: Date | null;
};

/** Bounded to active, non-manual campaigns — the only ones the daily cron ever considers. */
export async function getCampaignScanStatuses(): Promise<CampaignScanStatusRow[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "active", sourceType: { not: "manual" } },
    orderBy: { lastScanAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      sourceType: true,
      status: true,
      lastScanAt: true,
      lastScanStatus: true,
      lastScanError: true,
      scanLockedAt: true,
      company: { select: { name: true } },
    },
  });
  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    companyName: c.company.name,
    sourceType: c.sourceType,
    status: c.status,
    lastScanAt: c.lastScanAt,
    lastScanStatus: c.lastScanStatus,
    lastScanError: c.lastScanError,
    scanLockedAt: c.scanLockedAt,
  }));
}
