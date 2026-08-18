import { requireAdmin } from "@/lib/auth";
import { getAdminActivityFeed, type AdminActivityEvent } from "@/lib/admin/activity";
import { EmptyState } from "@/components/admin/AdminUI";

const KIND_LABEL: Record<AdminActivityEvent["kind"], string> = {
  opportunity_activity: "Opportunity",
  new_customer: "New Customer",
  billing_event: "Billing",
  scan_failed: "Scan Failed",
};

const KIND_TONE: Record<AdminActivityEvent["kind"], string> = {
  opportunity_activity: "text-muted",
  new_customer: "text-good",
  billing_event: "text-accent",
  scan_failed: "text-risk",
};

export default async function AdminActivityPage() {
  await requireAdmin();
  const events = await getAdminActivityFeed(100);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Activity / Logs</h1>
        <p className="text-sm text-muted">
          Last 14 days, composed from existing data (opportunity activity, new signups, Stripe event ledger, failed scans) — no
          secrets, tokens, or payment details shown.
        </p>
      </div>

      {events.length === 0 ? (
        <EmptyState>No activity in the last 14 days.</EmptyState>
      ) : (
        <div className="rounded-lg border border-line bg-surface overflow-hidden">
          {events.map((e) => (
            <div key={e.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 border-b border-line last:border-b-0 text-sm">
              <div className="flex items-start gap-3 min-w-0">
                <span className={`shrink-0 text-xs font-mono uppercase tracking-wide ${KIND_TONE[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                <div className="min-w-0">
                  <p className="break-words">{e.summary}</p>
                  {e.companyName && <p className="text-xs text-muted">{e.companyName}</p>}
                </div>
              </div>
              <span className="text-xs text-muted font-mono whitespace-nowrap ml-auto sm:ml-0">{e.at.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
