import { requireAdmin } from "@/lib/auth";
import { getAdminUsageSummary, type ProviderUsageSummary } from "@/lib/admin/usage";
import { StatCard, StatCardRow, SectionCard, EmptyState, formatUsd } from "@/components/admin/AdminUI";

function ProviderCard({ summary }: { summary: ProviderUsageSummary }) {
  const last7 = summary.byDay.slice(-7);
  return (
    <SectionCard title={summary.label}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm mb-4">
        <dt className="text-muted">API calls (30d)</dt>
        <dd className="sm:text-right">{summary.totalCalls}</dd>
        <dt className="text-muted">Estimated cost (30d)</dt>
        <dd className="sm:text-right">{formatUsd(summary.totalCostUsd)}</dd>
        <dt className="text-muted">Cache hit rate</dt>
        <dd className="sm:text-right">{(summary.cacheHitRate * 100).toFixed(0)}%</dd>
      </dl>
      <p className="text-xs uppercase tracking-widest text-muted font-mono mb-2">Last 7 days</p>
      <div className="flex flex-col gap-1 mb-4">
        {last7.map((d) => (
          <div key={d.date} className="flex items-center justify-between text-xs font-mono">
            <span className="text-muted">{d.date}</span>
            <span>
              {d.calls} calls · {formatUsd(d.costUsd)}
            </span>
          </div>
        ))}
      </div>
      {summary.byCompany.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-widest text-muted font-mono mb-2">Top companies by spend</p>
          <div className="flex flex-col gap-1">
            {summary.byCompany.map((c) => (
              <div key={c.companyId ?? "unattributed"} className="flex items-center justify-between text-xs">
                <span>{c.companyName}</span>
                <span className="text-muted font-mono">
                  {c.calls} calls · {formatUsd(c.costUsd)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

export default async function AdminUsagePage() {
  await requireAdmin();
  const usage = await getAdminUsageSummary();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Usage &amp; Costs</h1>
        <p className="text-sm text-muted">Internal operational usage — never shown to customers. Reads the existing ProviderUsageEvent cost ledger.</p>
      </div>

      <StatCardRow>
        <StatCard label="Total Estimated Cost (30d)" value={formatUsd(usage.totalEstimatedCostUsd)} />
        <StatCard label="Reddit Calls (30d)" value={usage.reddit.totalCalls} />
        <StatCard label="X/Twitter Calls (30d)" value={usage.twitter.totalCalls} />
        <StatCard label="Gemini Analyses (30d)" value={usage.gemini.totalAnalyses} />
      </StatCardRow>

      <ProviderCard summary={usage.reddit} />
      <ProviderCard summary={usage.twitter} />

      <SectionCard title="Gemini (AI analysis)">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm mb-4">
          <dt className="text-muted">Analyses (30d)</dt>
          <dd className="sm:text-right">{usage.gemini.totalAnalyses}</dd>
          <dt className="text-muted">Estimated cost (30d)</dt>
          <dd className="sm:text-right">{formatUsd(usage.gemini.totalEstimatedCostUsd)}</dd>
        </dl>
        <p className="text-xs text-muted mb-3">
          No per-call token ledger exists for Gemini today — this is the same per-analysis cost estimate the scan-funnel already
          computes (ScanRun.estimatedAiCostUsd), not a reconciled bill.
        </p>
        {usage.gemini.byDay.every((d) => d.analyses === 0) ? (
          <EmptyState>No AI analyses in the last 30 days.</EmptyState>
        ) : (
          <div className="flex flex-col gap-1">
            {usage.gemini.byDay.slice(-7).map((d) => (
              <div key={d.date} className="flex items-center justify-between text-xs font-mono">
                <span className="text-muted">{d.date}</span>
                <span>
                  {d.analyses} analyses · {formatUsd(d.costUsd)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
