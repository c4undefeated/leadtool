import { requireAdmin } from "@/lib/auth";
import { getScanRunHistory, reconstructLatestBatch, getCampaignScanStatuses } from "@/lib/admin/cron";
import { nextDailyScanAt } from "@/lib/format";
import { StatCard, StatCardRow, SectionCard, EmptyState, relativeOrNever } from "@/components/admin/AdminUI";

const STATUS_TONE: Record<string, string> = {
  completed: "text-good",
  failed: "text-risk",
  not_configured: "text-muted",
  running: "text-caution",
};

export default async function AdminCronPage() {
  await requireAdmin();
  const [history, campaigns] = await Promise.all([getScanRunHistory(50), getCampaignScanStatuses()]);
  const latestBatch = reconstructLatestBatch(history);

  const dueSoon = campaigns.filter((c) => !c.lastScanAt);
  const failed = campaigns.filter((c) => c.lastScanStatus === "failed");
  const running = campaigns.filter((c) => c.scanLockedAt);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Scan / Cron Monitor</h1>
        <p className="text-sm text-muted">
          IntentScout's one daily cron, unchanged — atomic per-campaign locking, 10-minute lease recovery, honest status. This page
          only reads existing scan history.
        </p>
      </div>

      <StatCardRow>
        <StatCard label="Active Campaigns" value={campaigns.length} />
        <StatCard label="Currently Running" value={running.length} />
        <StatCard label="Failed (current status)" value={failed.length} />
        <StatCard label="Never Scanned" value={dueSoon.length} />
      </StatCardRow>

      <SectionCard title="Latest cron batch (approximate)">
        <p className="text-xs text-muted mb-3">
          No single "cron run" record is persisted — this groups the most recent ScanRun rows that started within a few minutes of
          each other, since one daily cron invocation kicks its campaigns off together. Treat it as a close estimate, not an exact
          count.
        </p>
        {latestBatch ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted">Started</dt>
            <dd className="sm:text-right">{latestBatch.windowStart.toLocaleString()}</dd>
            <dt className="text-muted">Campaigns scanned</dt>
            <dd className="sm:text-right">{latestBatch.scansAttempted}</dd>
            <dt className="text-muted">Opportunities generated</dt>
            <dd className="sm:text-right">{latestBatch.opportunitiesCreated}</dd>
            <dt className="text-muted">Failures in batch</dt>
            <dd className="sm:text-right">{latestBatch.failedCount}</dd>
            <dt className="text-muted">Combined scan duration</dt>
            <dd className="sm:text-right">{(latestBatch.totalDurationMs / 1000).toFixed(1)}s</dd>
          </dl>
        ) : (
          <EmptyState>No scans recorded yet.</EmptyState>
        )}
        <p className="text-xs text-muted mt-4">Next scheduled cron: {nextDailyScanAt().toLocaleString()}</p>
      </SectionCard>

      <SectionCard title={`Campaigns currently failing (${failed.length})`}>
        {failed.length === 0 ? (
          <EmptyState>No campaigns are currently in a failed state.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {failed.map((c) => (
              <div key={c.id} className="text-sm border-b border-line last:border-b-0 pb-2 last:pb-0">
                <p>
                  <span className="font-medium">{c.name}</span> <span className="text-muted">({c.companyName})</span>
                </p>
                <p className="text-xs text-risk font-mono">{c.lastScanError ?? "no error message recorded"}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent scan history">
        {history.length === 0 ? (
          <EmptyState>No scans recorded yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Campaign</th>
                  <th className="py-2 pr-3 font-medium">Company</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Started</th>
                  <th className="py-2 pr-3 font-medium">Duration</th>
                  <th className="py-2 pr-3 font-medium">Ingested</th>
                  <th className="py-2 pr-3 font-medium">Opportunities</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const status = r.notConfigured ? "not_configured" : r.providerErrors > 0 || r.aiErrors > 0 ? "failed" : "completed";
                  return (
                    <tr key={r.id} className="border-b border-line last:border-b-0">
                      <td className="py-2 pr-3">{r.campaignName}</td>
                      <td className="py-2 pr-3 text-muted">{r.companyName}</td>
                      <td className="py-2 pr-3 text-muted">{r.sourceType}</td>
                      <td className="py-2 pr-3 text-muted">{relativeOrNever(r.startedAt)}</td>
                      <td className="py-2 pr-3 text-muted">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                      <td className="py-2 pr-3">{r.conversationsIngested}</td>
                      <td className="py-2 pr-3">{r.opportunitiesCreated}</td>
                      <td className={`py-2 pr-3 font-mono text-xs ${STATUS_TONE[status]}`}>{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
