import { prisma } from "@/lib/prisma";
import { PLANS, isPlanId } from "@/lib/billing/plans";
import { getSystemHealth, type ComponentHealth } from "@/lib/admin/health";
import { getScanRunHistory, reconstructLatestBatch } from "@/lib/admin/cron";
import { nextDailyScanAt } from "@/lib/format";

function startOfDayUtc(daysAgo: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

export type AdminOverview = {
  totalCustomers: number;
  activeSubscriptions: number;
  trialUsers: number;
  mrrUsd: number;
  totalOpportunities: number;
  opportunitiesToday: number;
  opportunitiesLast7Days: number;
  opportunitiesLast30Days: number;
  health: ComponentHealth[];
  lastSuccessfulScan: Date | null;
  nextScheduledScan: Date;
  latestBatch: ReturnType<typeof reconstructLatestBatch>;
  failedScansLast7Days: number;
  providerErrorsLast7Days: number;
  aiAnalysesLast7Days: number;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const since30 = startOfDayUtc(30);
  const since7 = startOfDayUtc(7);
  const sinceToday = startOfDayUtc(0);

  const [
    totalCustomers,
    subscriptionCounts,
    totalOpportunities,
    opportunitiesToday,
    opportunitiesLast7Days,
    opportunitiesLast30Days,
    health,
    scanHistory,
    lastCompletedScan,
    scanRunAgg7d,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.company.groupBy({ by: ["plan", "subscriptionStatus"], _count: true }),
    prisma.opportunity.count(),
    prisma.opportunity.count({ where: { analyzedAt: { gte: sinceToday } } }),
    prisma.opportunity.count({ where: { analyzedAt: { gte: since7 } } }),
    prisma.opportunity.count({ where: { analyzedAt: { gte: since30 } } }),
    getSystemHealth(),
    getScanRunHistory(50),
    prisma.campaign.findFirst({
      where: { lastScanStatus: "completed" },
      orderBy: { lastScanAt: "desc" },
      select: { lastScanAt: true },
    }),
    prisma.scanRun.aggregate({
      where: { startedAt: { gte: since7 } },
      _sum: { aiAnalyzedCount: true, providerErrors: true },
    }),
  ]);

  let activeSubscriptions = 0;
  let trialUsers = 0;
  let mrrUsd = 0;
  for (const row of subscriptionCounts) {
    if (row.subscriptionStatus === "active") activeSubscriptions += row._count;
    if (row.subscriptionStatus === "trialing") trialUsers += row._count;
    if ((row.subscriptionStatus === "active" || row.subscriptionStatus === "past_due") && row.plan && isPlanId(row.plan)) {
      mrrUsd += PLANS[row.plan].priceUsd * row._count;
    }
  }

  const failedScansLast7Days = await prisma.campaign.count({
    where: { lastScanStatus: "failed", lastScanStartedAt: { gte: since7 } },
  });

  return {
    totalCustomers,
    activeSubscriptions,
    trialUsers,
    mrrUsd,
    totalOpportunities,
    opportunitiesToday,
    opportunitiesLast7Days,
    opportunitiesLast30Days,
    health,
    lastSuccessfulScan: lastCompletedScan?.lastScanAt ?? null,
    nextScheduledScan: nextDailyScanAt(),
    latestBatch: reconstructLatestBatch(scanHistory),
    failedScansLast7Days,
    providerErrorsLast7Days: scanRunAgg7d._sum.providerErrors ?? 0,
    aiAnalysesLast7Days: scanRunAgg7d._sum.aiAnalyzedCount ?? 0,
  };
}
