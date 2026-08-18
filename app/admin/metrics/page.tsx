import { requireAdmin } from "@/lib/auth";
import { getEngineMetrics } from "@/lib/admin/metrics";
import { StatCard, StatCardRow, SectionCard, EmptyState } from "@/components/admin/AdminUI";

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 shrink-0 text-muted font-mono text-xs">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-line overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs">{count}</span>
    </div>
  );
}

export default async function AdminMetricsPage() {
  await requireAdmin();
  const metrics = await getEngineMetrics();
  const maxScore = Math.max(
    1,
    ...metrics.intentScoreDistribution.map((b) => b.count),
    ...metrics.fitScoreDistribution.map((b) => b.count),
    ...metrics.matchScoreDistribution.map((b) => b.count),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Engine Metrics</h1>
        <p className="text-sm text-muted">Is IntentScout actually producing useful opportunities? Last 30 days, read-only — the scoring algorithm itself is untouched.</p>
      </div>

      <StatCardRow>
        <StatCard label="Today" value={metrics.opportunitiesToday} />
        <StatCard label="Last 7 Days" value={metrics.opportunitiesLast7Days} />
        <StatCard label="Last 30 Days" value={metrics.opportunitiesLast30Days} />
      </StatCardRow>

      <div className="grid gap-4 sm:grid-cols-2">
        <SectionCard title="By source">
          {metrics.bySource.length === 0 ? (
            <EmptyState>No opportunities in the last 30 days.</EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {metrics.bySource.map((s) => (
                <div key={s.source} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{s.source}</span>
                  <span className="font-mono">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Safety labels">
          {metrics.safetyLabels.length === 0 ? (
            <EmptyState>No opportunities in the last 30 days.</EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {metrics.safetyLabels.map((s) => (
                <div key={s.safetyLabel} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{s.safetyLabel.replace("_", " ")}</span>
                  <span className="font-mono">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Intent categories">
        {metrics.intentCategories.length === 0 ? (
          <EmptyState>No opportunities in the last 30 days.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {metrics.intentCategories.map((c) => (
              <div key={c.intentCategory} className="flex items-center justify-between text-sm">
                <span className="capitalize">{c.intentCategory.replace(/_/g, " ")}</span>
                <span className="font-mono">{c.count}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Score distributions (last 30 days)">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted font-mono mb-3">Intent</p>
            <div className="flex flex-col gap-2">
              {metrics.intentScoreDistribution.map((b) => (
                <BarRow key={b.range} label={b.range} count={b.count} max={maxScore} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted font-mono mb-3">Fit</p>
            <div className="flex flex-col gap-2">
              {metrics.fitScoreDistribution.map((b) => (
                <BarRow key={b.range} label={b.range} count={b.count} max={maxScore} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted font-mono mb-3">Match</p>
            <div className="flex flex-col gap-2">
              {metrics.matchScoreDistribution.map((b) => (
                <BarRow key={b.range} label={b.range} count={b.count} max={maxScore} />
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Opportunity outcomes">
        {metrics.outcomeBreakdown.length === 0 ? (
          <EmptyState>No opportunities in the last 30 days.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {metrics.outcomeBreakdown.map((o) => (
              <div key={o.status} className="flex items-center justify-between text-sm">
                <span className="capitalize">{o.status}</span>
                <span className="font-mono">{o.count}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
