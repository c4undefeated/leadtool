import { prisma } from "@/lib/prisma";

function startOfDayUtc(daysAgo: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

export type ScoreBucket = { range: string; count: number };

async function scoreBuckets(field: "intentScore" | "fitScore" | "matchScore", since: Date): Promise<ScoreBucket[]> {
  const ranges: [string, number, number][] = [
    ["0-20", 0, 20],
    ["21-40", 21, 40],
    ["41-60", 41, 60],
    ["61-80", 61, 80],
    ["81-100", 81, 100],
  ];
  const counts = await Promise.all(
    ranges.map(([, min, max]) =>
      prisma.opportunity.count({ where: { analyzedAt: { gte: since }, [field]: { gte: min, lte: max } } }),
    ),
  );
  return ranges.map(([range], i) => ({ range, count: counts[i]! }));
}

export type SourceBreakdown = { source: string; count: number };
export type SafetyBreakdown = { safetyLabel: string; count: number };
export type IntentCategoryBreakdown = { intentCategory: string; count: number };

export type AdminEngineMetrics = {
  opportunitiesToday: number;
  opportunitiesLast7Days: number;
  opportunitiesLast30Days: number;
  bySource: SourceBreakdown[];
  safetyLabels: SafetyBreakdown[];
  intentCategories: IntentCategoryBreakdown[];
  intentScoreDistribution: ScoreBucket[];
  fitScoreDistribution: ScoreBucket[];
  matchScoreDistribution: ScoreBucket[];
  outcomeBreakdown: { status: string; count: number }[];
};

/** All queries bounded to the last 30 days — a distribution of "recent engine output," not a lifetime table scan. */
export async function getEngineMetrics(): Promise<AdminEngineMetrics> {
  const since30 = startOfDayUtc(30);
  const since7 = startOfDayUtc(7);
  const sinceToday = startOfDayUtc(0);

  const [
    opportunitiesToday,
    opportunitiesLast7Days,
    opportunitiesLast30Days,
    bySourceRaw,
    safetyLabelsRaw,
    intentCategoriesRaw,
    intentScoreDistribution,
    fitScoreDistribution,
    matchScoreDistribution,
    outcomeRaw,
  ] = await Promise.all([
    prisma.opportunity.count({ where: { analyzedAt: { gte: sinceToday } } }),
    prisma.opportunity.count({ where: { analyzedAt: { gte: since7 } } }),
    prisma.opportunity.count({ where: { analyzedAt: { gte: since30 } } }),
    prisma.opportunity.findMany({
      where: { analyzedAt: { gte: since30 } },
      select: { conversation: { select: { source: true } } },
    }),
    prisma.opportunity.groupBy({ by: ["safetyLabel"], _count: true, where: { analyzedAt: { gte: since30 } } }),
    prisma.opportunity.groupBy({ by: ["intentCategory"], _count: true, where: { analyzedAt: { gte: since30 } } }),
    scoreBuckets("intentScore", since30),
    scoreBuckets("fitScore", since30),
    scoreBuckets("matchScore", since30),
    prisma.opportunity.groupBy({ by: ["status"], _count: true, where: { analyzedAt: { gte: since30 } } }),
  ]);

  const sourceCounts = new Map<string, number>();
  for (const o of bySourceRaw) sourceCounts.set(o.conversation.source, (sourceCounts.get(o.conversation.source) ?? 0) + 1);

  return {
    opportunitiesToday,
    opportunitiesLast7Days,
    opportunitiesLast30Days,
    bySource: [...sourceCounts.entries()].map(([source, count]) => ({ source, count })),
    safetyLabels: safetyLabelsRaw.map((r) => ({ safetyLabel: r.safetyLabel, count: r._count })),
    intentCategories: intentCategoriesRaw.map((r) => ({ intentCategory: r.intentCategory ?? "unclassified", count: r._count })),
    intentScoreDistribution,
    fitScoreDistribution,
    matchScoreDistribution,
    outcomeBreakdown: outcomeRaw.map((r) => ({ status: r.status, count: r._count })),
  };
}
