import { prisma } from "@/lib/prisma";

const USAGE_WINDOW_DAYS = 30;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * 86_400_000)));
  return days;
}

export type ProviderUsageSummary = {
  provider: "redditapis" | "twitterapis";
  label: string;
  totalCalls: number;
  totalCostUsd: number;
  cacheHitRate: number;
  byDay: { date: string; calls: number; costUsd: number }[];
  byCompany: { companyName: string; companyId: string | null; calls: number; costUsd: number }[];
};

async function providerUsage(provider: "redditapis" | "twitterapis", label: string): Promise<ProviderUsageSummary> {
  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 86_400_000);
  const events = await prisma.providerUsageEvent.findMany({
    where: { provider, createdAt: { gte: since } },
    select: { createdAt: true, unitCostUsd: true, cacheHit: true, companyId: true },
  });

  const days = lastNDays(USAGE_WINDOW_DAYS);
  const byDayMap = new Map(days.map((d) => [d, { calls: 0, costUsd: 0 }]));
  const byCompanyMap = new Map<string, { calls: number; costUsd: number }>();
  let totalCalls = 0;
  let totalCostUsd = 0;
  let cacheHits = 0;

  for (const e of events) {
    totalCalls += 1;
    totalCostUsd += e.unitCostUsd;
    if (e.cacheHit) cacheHits += 1;
    const key = dayKey(e.createdAt);
    const bucket = byDayMap.get(key);
    if (bucket) {
      bucket.calls += 1;
      bucket.costUsd += e.unitCostUsd;
    }
    const companyKey = e.companyId ?? "__unattributed__";
    const companyBucket = byCompanyMap.get(companyKey) ?? { calls: 0, costUsd: 0 };
    companyBucket.calls += 1;
    companyBucket.costUsd += e.unitCostUsd;
    byCompanyMap.set(companyKey, companyBucket);
  }

  // Resolve company names for the top spenders only — bounded, not a full-table join.
  const topCompanyIds = [...byCompanyMap.entries()]
    .filter(([id]) => id !== "__unattributed__")
    .sort((a, b) => b[1].costUsd - a[1].costUsd)
    .slice(0, 10)
    .map(([id]) => id);
  const companies = topCompanyIds.length
    ? await prisma.company.findMany({ where: { id: { in: topCompanyIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(companies.map((c) => [c.id, c.name]));

  const byCompany = topCompanyIds.map((id) => ({
    companyId: id,
    companyName: nameById.get(id) ?? "Unknown",
    calls: byCompanyMap.get(id)!.calls,
    costUsd: byCompanyMap.get(id)!.costUsd,
  }));
  const unattributed = byCompanyMap.get("__unattributed__");
  if (unattributed) {
    byCompany.push({ companyId: null as unknown as string, companyName: "Unattributed", calls: unattributed.calls, costUsd: unattributed.costUsd });
  }

  return {
    provider,
    label,
    totalCalls,
    totalCostUsd,
    cacheHitRate: totalCalls > 0 ? cacheHits / totalCalls : 0,
    byDay: days.map((d) => ({ date: d, ...byDayMap.get(d)! })),
    byCompany,
  };
}

export type GeminiUsageSummary = {
  totalAnalyses: number;
  totalEstimatedCostUsd: number;
  byDay: { date: string; analyses: number; costUsd: number }[];
};

/** No per-call Gemini ledger exists — this is ScanRun.aiAnalyzedCount/estimatedAiCostUsd, the same estimate the customer-facing scan-funnel already uses. */
async function geminiUsage(): Promise<GeminiUsageSummary> {
  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 86_400_000);
  const runs = await prisma.scanRun.findMany({
    where: { startedAt: { gte: since } },
    select: { startedAt: true, aiAnalyzedCount: true, estimatedAiCostUsd: true },
  });

  const days = lastNDays(USAGE_WINDOW_DAYS);
  const byDayMap = new Map(days.map((d) => [d, { analyses: 0, costUsd: 0 }]));
  let totalAnalyses = 0;
  let totalEstimatedCostUsd = 0;
  for (const r of runs) {
    totalAnalyses += r.aiAnalyzedCount;
    totalEstimatedCostUsd += r.estimatedAiCostUsd;
    const bucket = byDayMap.get(dayKey(r.startedAt));
    if (bucket) {
      bucket.analyses += r.aiAnalyzedCount;
      bucket.costUsd += r.estimatedAiCostUsd;
    }
  }

  return { totalAnalyses, totalEstimatedCostUsd, byDay: days.map((d) => ({ date: d, ...byDayMap.get(d)! })) };
}

export type AdminUsageSummary = {
  reddit: ProviderUsageSummary;
  twitter: ProviderUsageSummary;
  gemini: GeminiUsageSummary;
  totalEstimatedCostUsd: number;
};

export async function getAdminUsageSummary(): Promise<AdminUsageSummary> {
  const [reddit, twitter, gemini] = await Promise.all([
    providerUsage("redditapis", "Reddit (Redditapis)"),
    providerUsage("twitterapis", "X/Twitter (TwitterAPIs)"),
    geminiUsage(),
  ]);
  return {
    reddit,
    twitter,
    gemini,
    totalEstimatedCostUsd: reddit.totalCostUsd + twitter.totalCostUsd + gemini.totalEstimatedCostUsd,
  };
}
