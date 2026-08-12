import { prisma } from "@/lib/prisma";

export type Trend = {
  value: number;
  /** null when there's no prior-week baseline to compare against — never a fabricated percentage. */
  deltaPercent: number | null;
  /** Daily counts for the last 14 days, oldest first — real data, not a decorative placeholder. */
  series: number[];
};

export type DashboardStats = {
  found: Trend;
  contacted: Trend;
  replied: Trend;
  /** Daily [contacted, replied] pairs for the last 30 days, oldest first — feeds the activity chart. */
  activitySeries: { date: string; contacted: number; replied: number }[];
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function last14Days(): string[] {
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    days.push(dayKey(new Date(Date.now() - i * 86_400_000)));
  }
  return days;
}

function last30Days(): string[] {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    days.push(dayKey(new Date(Date.now() - i * 86_400_000)));
  }
  return days;
}

function bucketByDay(dates: Date[], days: string[]): number[] {
  const counts = new Map(days.map((d) => [d, 0]));
  for (const date of dates) {
    const key = dayKey(date);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return days.map((d) => counts.get(d) ?? 0);
}

function trendFromSeries(series14: number[]): Trend {
  const thisWeek = series14.slice(7).reduce((a, b) => a + b, 0);
  const lastWeek = series14.slice(0, 7).reduce((a, b) => a + b, 0);
  const deltaPercent = lastWeek === 0 ? null : ((thisWeek - lastWeek) / lastWeek) * 100;
  return { value: thisWeek, deltaPercent, series: series14 };
}

/**
 * Every number here comes straight from Opportunity/Activity rows — no
 * placeholder trends, no invented percentages. A metric with no prior-week
 * baseline reports `deltaPercent: null` (rendered as "new" or "no activity
 * yet") instead of a misleading +100%/±∞.
 */
export async function getDashboardStats(companyId: string): Promise<DashboardStats> {
  const since30 = new Date(Date.now() - 30 * 86_400_000);

  const [opportunities, repliedActivity] = await Promise.all([
    prisma.opportunity.findMany({
      where: { conversation: { campaign: { companyId } } },
      select: { analyzedAt: true, contactedAt: true },
    }),
    prisma.activity.findMany({
      where: {
        opportunity: { conversation: { campaign: { companyId } } },
        event: "status_changed:replied",
        at: { gte: since30 },
      },
      select: { at: true },
    }),
  ]);

  const days14 = last14Days();
  const foundSeries = bucketByDay(
    opportunities.map((o) => o.analyzedAt),
    days14,
  );
  const contactedDates = opportunities.map((o) => o.contactedAt).filter((d): d is Date => d !== null);
  const contactedSeries = bucketByDay(contactedDates, days14);
  const repliedSeries = bucketByDay(
    repliedActivity.map((a) => a.at),
    days14,
  );

  const days30 = last30Days();
  const contacted30 = bucketByDay(contactedDates, days30);
  const replied30 = bucketByDay(
    repliedActivity.map((a) => a.at),
    days30,
  );
  const activitySeries = days30.map((date, i) => ({ date, contacted: contacted30[i]!, replied: replied30[i]! }));

  return {
    found: trendFromSeries(foundSeries),
    contacted: trendFromSeries(contactedSeries),
    replied: trendFromSeries(repliedSeries),
    activitySeries,
  };
}
