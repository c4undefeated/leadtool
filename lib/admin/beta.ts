import { prisma } from "@/lib/prisma";
import { getBetaSettings, utcDayStart, type BetaSettings } from "@/lib/beta";

const WEEK_DAYS = 7;

export type BetaUserRow = {
  userId: string;
  email: string;
  usedToday: number;
  remainingToday: number;
};

export type AdminBetaOverview = {
  settings: BetaSettings;
  // --- "Today" (spec section 1) ---
  usersWhoEverScanned: number;
  manualScansToday: number;
  manualScansUsedToday: number; // sum of BetaScanUsage.count today — should equal manualScansToday unless a claim was refunded
  totalOpportunitiesAllTime: number;
  estimatedSpendTodayUsd: number;
  // --- "Beta Activity" (spec section 12) ---
  manualScansThisWeek: number;
  opportunitiesThisWeek: number;
  conversationsDiscoveredThisWeek: number;
  geminiRequestsThisWeek: number;
  redditCallsThisWeek: number;
  twitterCallsThisWeek: number;
  avgOpportunitiesPerScanAllTime: number;
  usersWhoScannedToday: BetaUserRow[];
};

export async function getAdminBetaOverview(): Promise<AdminBetaOverview> {
  const today = utcDayStart();
  const weekAgo = new Date(Date.now() - WEEK_DAYS * 24 * 60 * 60 * 1000);

  const [settings, usersWhoEverScanned, todayUsageRows, allTimeAgg, weekRuns] = await Promise.all([
    getBetaSettings(),
    prisma.betaScanUsage.groupBy({ by: ["userId"], _sum: { count: true } }).then((rows) => rows.filter((r) => (r._sum.count ?? 0) > 0).length),
    prisma.betaScanUsage.findMany({ where: { day: today }, include: { user: { select: { email: true } } } }),
    prisma.scanRun.aggregate({
      where: { trigger: "beta_manual" },
      _count: { _all: true },
      _sum: { opportunitiesCreated: true },
    }),
    prisma.scanRun.findMany({
      where: { trigger: "beta_manual", startedAt: { gte: weekAgo } },
      select: {
        startedAt: true,
        opportunitiesCreated: true,
        uniqueConversations: true,
        aiAnalyzedCount: true,
        providerCalls: true,
        providerSpendUsd: true,
        estimatedAiCostUsd: true,
        triggeredByUserId: true,
        campaign: { select: { sourceType: true } },
      },
    }),
  ]);

  let manualScansToday = 0;
  let manualScansThisWeek = 0;
  let opportunitiesThisWeek = 0;
  let conversationsDiscoveredThisWeek = 0;
  let geminiRequestsThisWeek = 0;
  let redditCallsThisWeek = 0;
  let twitterCallsThisWeek = 0;
  let estimatedSpendTodayUsd = 0;
  let estimatedSpendThisWeekUsd = 0;

  for (const r of weekRuns) {
    manualScansThisWeek += 1;
    opportunitiesThisWeek += r.opportunitiesCreated;
    conversationsDiscoveredThisWeek += r.uniqueConversations;
    geminiRequestsThisWeek += r.aiAnalyzedCount;
    if (r.campaign.sourceType === "twitter") twitterCallsThisWeek += r.providerCalls;
    else redditCallsThisWeek += r.providerCalls;
    const spend = r.providerSpendUsd + r.estimatedAiCostUsd;
    estimatedSpendThisWeekUsd += spend;
    if (r.startedAt >= today) {
      manualScansToday += 1;
      estimatedSpendTodayUsd += spend;
    }
  }
  void estimatedSpendThisWeekUsd; // kept for the activity breakdown below, not surfaced as its own tile (today's figure is the spec-required one)

  const manualScansUsedToday = todayUsageRows.reduce((sum, r) => sum + r.count, 0);
  const usersWhoScannedToday: BetaUserRow[] = todayUsageRows
    .filter((r) => r.count > 0)
    .map((r) => ({ userId: r.userId, email: r.user.email, usedToday: r.count, remainingToday: Math.max(0, settings.manualScansPerUserPerDay - r.count) }))
    .sort((a, b) => b.usedToday - a.usedToday);

  const totalScansAllTime = allTimeAgg._count._all;
  const totalOpportunitiesAllTime = allTimeAgg._sum.opportunitiesCreated ?? 0;

  return {
    settings,
    usersWhoEverScanned,
    manualScansToday,
    manualScansUsedToday,
    totalOpportunitiesAllTime,
    estimatedSpendTodayUsd,
    manualScansThisWeek,
    opportunitiesThisWeek,
    conversationsDiscoveredThisWeek,
    geminiRequestsThisWeek,
    redditCallsThisWeek,
    twitterCallsThisWeek,
    avgOpportunitiesPerScanAllTime: totalScansAllTime > 0 ? totalOpportunitiesAllTime / totalScansAllTime : 0,
    usersWhoScannedToday,
  };
}
