import { requireAdmin } from "@/lib/auth";
import { getAdminOverview } from "@/lib/admin/overview";
import { StatCard, StatCardRow, SectionCard, HealthPill, formatUsd, relativeOrNever } from "@/components/admin/AdminUI";

export default async function AdminOverviewPage() {
  await requireAdmin();
  const overview = await getAdminOverview();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Admin Overview</h1>
        <p className="text-sm text-muted">A high-level view of IntentScout — customers, revenue, and engine health.</p>
      </div>

      <StatCardRow>
        <StatCard label="Customers" value={overview.totalCustomers} />
        <StatCard label="Active Subscriptions" value={overview.activeSubscriptions} />
        <StatCard label="Trial Users" value={overview.trialUsers} />
        <StatCard label="MRR" value={formatUsd(overview.mrrUsd)} />
      </StatCardRow>

      <StatCardRow>
        <StatCard label="Total Opportunities" value={overview.totalOpportunities} />
        <StatCard label="Opportunities Today" value={overview.opportunitiesToday} />
        <StatCard label="Last 7 Days" value={overview.opportunitiesLast7Days} />
        <StatCard label="Last 30 Days" value={overview.opportunitiesLast30Days} />
      </StatCardRow>

      <SectionCard title="Today's Engine Health">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overview.health.map((h) => (
            <div key={h.name} className="rounded-md border border-line p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{h.name}</span>
                <HealthPill status={h.status} />
              </div>
              <p className="text-xs text-muted">{h.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Daily Scan Snapshot">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted">Last successful scan</dt>
          <dd className="sm:text-right">{relativeOrNever(overview.lastSuccessfulScan)}</dd>
          <dt className="text-muted">Next scheduled scan</dt>
          <dd className="sm:text-right">{overview.nextScheduledScan.toLocaleString()}</dd>
          <dt className="text-muted">Latest cron batch (approx.)</dt>
          <dd className="sm:text-right">
            {overview.latestBatch
              ? `${overview.latestBatch.scansAttempted} campaign${overview.latestBatch.scansAttempted === 1 ? "" : "s"}, ${overview.latestBatch.opportunitiesCreated} opportunit${overview.latestBatch.opportunitiesCreated === 1 ? "y" : "ies"}`
              : "no recent scans"}
          </dd>
          <dt className="text-muted">Failed scans (7d)</dt>
          <dd className="sm:text-right">{overview.failedScansLast7Days}</dd>
          <dt className="text-muted">Provider errors (7d)</dt>
          <dd className="sm:text-right">{overview.providerErrorsLast7Days}</dd>
          <dt className="text-muted">AI analyses (7d)</dt>
          <dd className="sm:text-right">{overview.aiAnalysesLast7Days}</dd>
        </dl>
        <p className="text-xs text-muted mt-4">
          Full history: <a href="/admin/cron" className="text-accent">Scan / Cron Monitor →</a>
        </p>
      </SectionCard>
    </div>
  );
}
