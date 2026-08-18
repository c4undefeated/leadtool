import { requireAdmin } from "@/lib/auth";
import { getSubscriptionsSummary, getRecentStripeEvents } from "@/lib/admin/subscriptions";
import { StatCard, StatCardRow, SectionCard, EmptyState, formatUsd } from "@/components/admin/AdminUI";

const STATUS_ORDER = ["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "none"];
const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past Due",
  canceled: "Canceled",
  unpaid: "Unpaid",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  none: "No subscription",
};

export default async function AdminSubscriptionsPage() {
  await requireAdmin();
  const [summary, recentEvents] = await Promise.all([getSubscriptionsSummary(), getRecentStripeEvents(20)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Subscriptions</h1>
        <p className="text-sm text-muted">Authoritative state read from Company's Stripe-synced fields (written only by verified webhook events).</p>
      </div>

      <StatCardRow>
        <StatCard label="MRR" value={formatUsd(summary.mrrUsd)} />
        <StatCard label="Paying Customers" value={summary.totalPaying} />
        <StatCard label="Trialing" value={summary.statusCounts.trialing ?? 0} />
        <StatCard label="Past Due" value={summary.statusCounts.past_due ?? 0} />
      </StatCardRow>

      <SectionCard title="Subscription status breakdown">
        <div className="grid gap-2 sm:grid-cols-2">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
              <span>{STATUS_LABELS[status]}</span>
              <span className="font-mono">{summary.statusCounts[status] ?? 0}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Plan distribution">
        <div className="flex flex-col gap-2">
          {summary.planDistribution.map((p) => (
            <div key={p.planId} className="flex items-center justify-between text-sm border-b border-line last:border-b-0 pb-2 last:pb-0">
              <span>{p.name}</span>
              <span className="text-muted font-mono">
                {p.count} subscriber{p.count === 1 ? "" : "s"} · {formatUsd(p.mrrUsd)}/mo
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Recent subscription activity" action={<span className="text-xs text-muted">Live from Stripe — upgrades, downgrades, cancellations, failed payments, refunds</span>}>
        {recentEvents.length === 0 ? (
          <EmptyState>No recent subscription events, or Stripe isn't configured in this environment.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {recentEvents.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-line last:border-b-0 pb-2 last:pb-0">
                <span>{e.summary}</span>
                <span className="text-xs text-muted font-mono whitespace-nowrap">{e.createdAt.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
