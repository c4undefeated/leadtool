import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getCustomerDetail } from "@/lib/admin/customers";
import { PLANS, isPlanId } from "@/lib/billing/plans";
import { SectionCard, relativeOrNever } from "@/components/admin/AdminUI";

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const customer = await getCustomerDetail(id);
  if (!customer) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/customers" className="text-xs text-muted hover:text-ink">
          ← Customers
        </Link>
        <h1 className="font-display text-2xl mt-1">{customer.users[0]?.email ?? "Account"}</h1>
        <p className="text-sm text-muted">Joined {customer.createdAt.toLocaleDateString()}</p>
      </div>

      <SectionCard title="Users">
        <div className="flex flex-col gap-2">
          {customer.users.map((u) => (
            <div key={u.id} className="flex items-center justify-between text-sm border-b border-line last:border-b-0 pb-2 last:pb-0">
              <div>
                <p>{u.name || "—"}</p>
                <p className="text-xs text-muted">{u.email}</p>
              </div>
              <span className="text-xs font-mono text-muted uppercase">{u.role}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Subscription">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted">Plan</dt>
          <dd className="sm:text-right">{customer.plan && isPlanId(customer.plan) ? PLANS[customer.plan].name : "No plan"}</dd>
          <dt className="text-muted">Status</dt>
          <dd className="sm:text-right">{customer.subscriptionStatus ?? "none"}</dd>
          <dt className="text-muted">Businesses</dt>
          <dd className="sm:text-right">
            {customer.businesses.length}
            {customer.plan && isPlanId(customer.plan) ? ` / ${PLANS[customer.plan].limits.maxBusinesses}` : ""}
          </dd>
          <dt className="text-muted">Trial ends</dt>
          <dd className="sm:text-right">{customer.trialEndsAt ? customer.trialEndsAt.toLocaleDateString() : "—"}</dd>
          <dt className="text-muted">Current period end</dt>
          <dd className="sm:text-right">{customer.currentPeriodEnd ? customer.currentPeriodEnd.toLocaleDateString() : "—"}</dd>
          <dt className="text-muted">Cancel at period end</dt>
          <dd className="sm:text-right">{customer.cancelAtPeriodEnd ? "Yes" : "No"}</dd>
          <dt className="text-muted">Stripe customer</dt>
          <dd className="sm:text-right font-mono text-xs">{customer.stripeCustomerId ?? "—"}</dd>
          <dt className="text-muted">Stripe subscription</dt>
          <dd className="sm:text-right font-mono text-xs">{customer.stripeSubscriptionId ?? "—"}</dd>
        </dl>
      </SectionCard>

      <SectionCard title="Usage">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted">Total opportunities (all businesses)</dt>
          <dd className="sm:text-right">{customer.totalOpportunityCount}</dd>
          <dt className="text-muted">Last activity</dt>
          <dd className="sm:text-right">{relativeOrNever(customer.lastActivityAt)}</dd>
        </dl>
      </SectionCard>

      <SectionCard title={`Businesses (${customer.businesses.length})`}>
        <div className="flex flex-col gap-4">
          {customer.businesses.map((b) => (
            <div key={b.id} className="border-b border-line last:border-b-0 pb-4 last:pb-0">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{b.name}</p>
                <span className="text-xs text-muted font-mono">
                  {b.opportunityCount} opportunit{b.opportunityCount === 1 ? "y" : "ies"} · {b.hasOffer ? "onboarded" : "mid-onboarding"}
                </span>
              </div>
              {b.campaigns.length === 0 ? (
                <p className="text-xs text-muted">No campaigns yet.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {b.campaigns.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span>{c.name}</span>
                      <span className="text-muted font-mono">
                        {c.sourceType} · {c.status} · last scan: {relativeOrNever(c.lastScanAt)} ({c.lastScanStatus ?? "never"})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
