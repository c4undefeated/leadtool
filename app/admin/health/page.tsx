import { requireAdmin } from "@/lib/auth";
import { getSystemHealth } from "@/lib/admin/health";
import { SectionCard, HealthPill, relativeOrNever } from "@/components/admin/AdminUI";

export default async function AdminHealthPage() {
  await requireAdmin();
  const health = await getSystemHealth();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">System Health</h1>
        <p className="text-sm text-muted">Reddit, X/Twitter, Gemini, the daily cron, the database, and Stripe — read from existing data, no extra external polling added.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {health.map((h) => (
          <SectionCard key={h.name} title={h.name} action={<HealthPill status={h.status} />}>
            <p className="text-sm text-ink mb-3">{h.detail}</p>
            <dl className="grid grid-cols-2 gap-y-2 text-xs">
              <dt className="text-muted">Last success</dt>
              <dd className="text-right">{relativeOrNever(h.lastSuccessAt)}</dd>
              <dt className="text-muted">Last error</dt>
              <dd className="text-right">{relativeOrNever(h.lastErrorAt)}</dd>
              <dt className="text-muted">Error count (24h)</dt>
              <dd className="text-right">{h.errorCount}</dd>
            </dl>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
