import { prisma } from "@/lib/prisma";
import { isRedditConfigured, isTwitterConfigured, isAiConfigured } from "@/lib/sourceAvailability";
import { getStripe } from "@/lib/stripe";

export type HealthStatus = "healthy" | "warning" | "error" | "not_configured";

export type ComponentHealth = {
  name: string;
  status: HealthStatus;
  detail: string;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  errorCount: number;
};

const HEALTH_WINDOW_HOURS = 24;

function windowStart(): Date {
  return new Date(Date.now() - HEALTH_WINDOW_HOURS * 60 * 60 * 1000);
}

/** Reddit or X/Twitter health from ProviderUsageEvent — the existing cost/call ledger, read-only. */
async function providerHealth(provider: "redditapis" | "twitterapis", label: string, configured: boolean): Promise<ComponentHealth> {
  if (!configured) {
    return { name: label, status: "not_configured", detail: "No API key set — this source is inactive.", lastSuccessAt: null, lastErrorAt: null, errorCount: 0 };
  }

  const since = windowStart();
  const [successes, failures] = await Promise.all([
    prisma.providerUsageEvent.findFirst({
      where: { provider, success: true, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.providerUsageEvent.findMany({
      where: { provider, success: false, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
      take: 50, // bounded — only need the count and the most recent, not full history
    }),
  ]);

  const errorCount = failures.length;
  const lastErrorAt = failures[0]?.createdAt ?? null;
  const lastSuccessAt = successes?.createdAt ?? null;

  let status: HealthStatus = "healthy";
  let detail = `${errorCount} error${errorCount === 1 ? "" : "s"} in the last ${HEALTH_WINDOW_HOURS}h.`;
  if (!lastSuccessAt && errorCount > 0) {
    status = "error";
    detail = `All ${errorCount} call${errorCount === 1 ? "" : "s"} in the last ${HEALTH_WINDOW_HOURS}h failed.`;
  } else if (errorCount >= 5) {
    status = "warning";
  } else if (!lastSuccessAt && errorCount === 0) {
    status = "warning";
    detail = `No calls recorded in the last ${HEALTH_WINDOW_HOURS}h.`;
  }

  return { name: label, status, detail, lastSuccessAt, lastErrorAt, errorCount };
}

/** Gemini has no per-call ledger (see ScanRun.estimatedAiCostUsd's own doc comment) — read from ScanRun's aiErrors/aiAnalyzedCount aggregates instead. */
async function geminiHealth(): Promise<ComponentHealth> {
  if (!isAiConfigured()) {
    return { name: "Gemini", status: "not_configured", detail: "GEMINI_API_KEY not set.", lastSuccessAt: null, lastErrorAt: null, errorCount: 0 };
  }

  const since = windowStart();
  const runs = await prisma.scanRun.findMany({
    where: { startedAt: { gte: since } },
    select: { aiAnalyzedCount: true, aiErrors: true, startedAt: true },
    orderBy: { startedAt: "desc" },
    take: 200,
  });

  const analyzed = runs.reduce((sum, r) => sum + r.aiAnalyzedCount, 0);
  const errors = runs.reduce((sum, r) => sum + r.aiErrors, 0);
  const lastRunWithAnalysis = runs.find((r) => r.aiAnalyzedCount > 0);
  const lastRunWithError = runs.find((r) => r.aiErrors > 0);

  let status: HealthStatus = "healthy";
  let detail = `${analyzed} analyses, ${errors} error${errors === 1 ? "" : "s"} in the last ${HEALTH_WINDOW_HOURS}h.`;
  if (analyzed > 0 && errors / Math.max(analyzed, 1) > 0.25) status = "error";
  else if (errors > 0) status = "warning";

  return {
    name: "Gemini",
    status,
    detail,
    lastSuccessAt: lastRunWithAnalysis?.startedAt ?? null,
    lastErrorAt: lastRunWithError?.startedAt ?? null,
    errorCount: errors,
  };
}

/** If this query runs at all, the database is reachable — a real outage would fail the page render itself before this ever returns. */
async function databaseHealth(): Promise<ComponentHealth> {
  const start = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const ms = Date.now() - start;
  return {
    name: "Database",
    status: ms > 2000 ? "warning" : "healthy",
    detail: `Responded in ${ms}ms.`,
    lastSuccessAt: new Date(),
    lastErrorAt: null,
    errorCount: 0,
  };
}

/** balance.retrieve is a free, side-effect-free Stripe API call — confirms the configured key actually works, not just that it's set. */
async function stripeHealth(): Promise<ComponentHealth> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { name: "Stripe", status: "not_configured", detail: "STRIPE_SECRET_KEY not set.", lastSuccessAt: null, lastErrorAt: null, errorCount: 0 };
  }
  try {
    await getStripe().balance.retrieve();
    return { name: "Stripe", status: "healthy", detail: "API key valid, connection OK.", lastSuccessAt: new Date(), lastErrorAt: null, errorCount: 0 };
  } catch (err) {
    return {
      name: "Stripe",
      status: "error",
      detail: err instanceof Error ? err.message : "Stripe API call failed.",
      lastSuccessAt: null,
      lastErrorAt: new Date(),
      errorCount: 1,
    };
  }
}

/** Cron health: are active, non-manual campaigns actually being scanned on schedule? */
async function cronHealth(): Promise<ComponentHealth> {
  const staleCutoff = new Date(Date.now() - 28 * 60 * 60 * 1000); // a bit over 24h — SCAN_DUE_THRESHOLD_HOURS default is 20h
  const [totalActive, recentlyScanned, failedNow, lastRun] = await Promise.all([
    prisma.campaign.count({ where: { status: "active", sourceType: { not: "manual" } } }),
    prisma.campaign.count({ where: { status: "active", sourceType: { not: "manual" }, lastScanAt: { gte: staleCutoff } } }),
    prisma.campaign.count({ where: { status: "active", sourceType: { not: "manual" }, lastScanStatus: "failed" } }),
    prisma.campaign.findFirst({
      where: { sourceType: { not: "manual" }, lastScanStartedAt: { not: null } },
      orderBy: { lastScanStartedAt: "desc" },
      select: { lastScanStartedAt: true, lastScanStatus: true },
    }),
  ]);

  let status: HealthStatus = "healthy";
  let detail = `${recentlyScanned}/${totalActive} active campaigns scanned within the last 28h.`;
  if (totalActive === 0) {
    status = "not_configured";
    detail = "No active automated campaigns exist yet.";
  } else if (recentlyScanned === 0) {
    status = "error";
    detail = `None of ${totalActive} active campaigns have scanned in the last 28h — the cron may not be running.`;
  } else if (recentlyScanned < totalActive || failedNow > 0) {
    status = "warning";
  }

  return {
    name: "Daily Cron",
    status,
    detail,
    lastSuccessAt: lastRun?.lastScanStatus === "completed" ? lastRun.lastScanStartedAt : null,
    lastErrorAt: lastRun?.lastScanStatus === "failed" ? lastRun.lastScanStartedAt : null,
    errorCount: failedNow,
  };
}

export async function getSystemHealth(): Promise<ComponentHealth[]> {
  const [reddit, twitter, gemini, database, stripe, cron] = await Promise.all([
    providerHealth("redditapis", "Reddit API", isRedditConfigured()),
    providerHealth("twitterapis", "X/Twitter API", isTwitterConfigured()),
    geminiHealth(),
    databaseHealth(),
    stripeHealth(),
    cronHealth(),
  ]);
  return [reddit, twitter, gemini, cron, database, stripe];
}
