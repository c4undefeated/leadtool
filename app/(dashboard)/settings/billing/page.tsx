import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyEntitlements } from "@/lib/billing/entitlements";
import { getStripe } from "@/lib/stripe";
import { PLAN_ORDER, PLANS, TRIAL_DAYS, type PlanId } from "@/lib/billing/plans";
import {
  startCheckoutAction,
  changePlanFormAction,
  cancelSubscriptionFormAction,
  reactivateSubscriptionFormAction,
  openBillingPortalAction,
} from "@/lib/actions/billing";

const STATUS_LABELS: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  unpaid: "Unpaid",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; notice?: string }>;
}) {
  const { checkout, notice } = await searchParams;
  const user = await requireUser();
  const companyId = user.companyId ?? "__none__";

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const entitlements = await getCompanyEntitlements(companyId);

  let paymentMethodSummary: string | null = null;
  let invoices: { id: string; date: Date; amount: number; status: string; url: string | null }[] = [];
  let stripeReadError = false;

  if (company?.stripeCustomerId) {
    try {
      const stripe = getStripe();
      const [customer, invoiceList] = await Promise.all([
        stripe.customers.retrieve(company.stripeCustomerId, {
          expand: ["invoice_settings.default_payment_method"],
        }),
        stripe.invoices.list({ customer: company.stripeCustomerId, limit: 12 }),
      ]);
      if (!("deleted" in customer) || !customer.deleted) {
        const pm = !("deleted" in customer) ? customer.invoice_settings?.default_payment_method : null;
        if (pm && typeof pm !== "string" && pm.card) {
          paymentMethodSummary = `${pm.card.brand.charAt(0).toUpperCase()}${pm.card.brand.slice(1)} •••• ${pm.card.last4}`;
        }
      }
      invoices = invoiceList.data.map((inv) => ({
        id: inv.id ?? inv.number ?? "invoice",
        date: new Date(inv.created * 1000),
        amount: inv.amount_paid,
        status: inv.status ?? "unknown",
        url: inv.hosted_invoice_url ?? null,
      }));
    } catch (err) {
      console.error("[billing page] failed to load Stripe account details:", err);
      stripeReadError = true;
    }
  }

  const planId = entitlements.planId;
  const plan = planId ? PLANS[planId] : null;
  const hasSubscription = !!company?.stripeSubscriptionId;

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Billing &amp; Usage</h1>
        <p className="text-sm text-muted">Manage your IntentScout plan, payment method, and billing history.</p>
      </div>

      {checkout === "success" && (
        <Banner tone="good">Subscription started — welcome to IntentScout. It may take a few seconds for your plan to activate.</Banner>
      )}
      {checkout === "canceled" && <Banner tone="neutral">Checkout was canceled — no charge was made.</Banner>}
      {notice === "already_subscribed" && (
        <Banner tone="neutral">You already have a subscription — use Upgrade/Downgrade below to switch plans.</Banner>
      )}
      {entitlements.status === "past_due" && (
        <Banner tone="warn">
          Your last payment failed. IntentScout still has access, but will lose it soon if payment isn't fixed —{" "}
          <PortalLink label="update your payment method" />.
        </Banner>
      )}
      {(entitlements.status === "unpaid" || entitlements.status === "incomplete_expired") && (
        <Banner tone="bad">Your subscription is {STATUS_LABELS[entitlements.status] ?? entitlements.status} — resubscribe below to restore access.</Banner>
      )}
      {stripeReadError && <Banner tone="neutral">Couldn't load payment method / invoice details right now — your plan and access are unaffected.</Banner>}

      {/* --- Current plan --- */}
      {hasSubscription && plan ? (
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-mono text-muted uppercase tracking-wide mb-1">Current plan</p>
              <p className="font-display text-2xl">
                {plan.name} <span className="text-base text-muted font-sans">${plan.priceUsd}/month</span>
              </p>
            </div>
            <StatusPill status={entitlements.status} />
          </div>

          {entitlements.isTrialing && (
            <div className="mt-4 rounded-md bg-accent/5 border border-accent/30 px-4 py-3 text-sm">
              <p className="text-ink font-medium">Trial ends {formatDate(entitlements.trialEndsAt)}.</p>
              <p className="text-muted mt-1">
                After your trial ends, you'll be charged ${plan.priceUsd}/month for {plan.name} unless you cancel first. You can
                cancel any time before then at no charge.
              </p>
            </div>
          )}

          {!entitlements.isTrialing && entitlements.cancelAtPeriodEnd && (
            <div className="mt-4 rounded-md bg-risk/5 border border-risk/30 px-4 py-3 text-sm">
              <p className="text-ink font-medium">Your subscription is set to cancel on {formatDate(entitlements.currentPeriodEnd)}.</p>
              <p className="text-muted mt-1">You'll keep access until then. Change your mind?</p>
              <form action={reactivateSubscriptionFormAction} className="mt-2">
                <SubmitButton className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                  Reactivate subscription
                </SubmitButton>
              </form>
            </div>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Renewal date</dt>
            <dd className="text-ink text-right">{entitlements.isTrialing ? formatDate(entitlements.trialEndsAt) : formatDate(entitlements.currentPeriodEnd)}</dd>
            <dt className="text-muted">Payment method</dt>
            <dd className="text-ink text-right">{paymentMethodSummary ?? "—"}</dd>
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            <form action={openBillingPortalAction}>
              <SubmitButton className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper">
                Manage payment method &amp; invoices
              </SubmitButton>
            </form>
            {!entitlements.cancelAtPeriodEnd && (
              <form action={cancelSubscriptionFormAction}>
                <SubmitButton className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-risk hover:bg-risk/5">
                  Cancel subscription
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-surface p-6 text-center">
          <p className="font-display text-lg mb-1">No active plan</p>
          <p className="text-sm text-muted max-w-md mx-auto">
            Subscribe to a plan to unlock automatic daily discovery across Reddit and X. Every plan starts with a{" "}
            {TRIAL_DAYS}-day free trial.
          </p>
        </div>
      )}

      {/* --- Plan picker / upgrade-downgrade --- */}
      <div>
        <h2 className="font-display text-lg mb-3">{hasSubscription ? "Change plan" : "Choose a plan"}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PLAN_ORDER.map((id) => (
            <PlanOptionCard key={id} id={id} isCurrent={id === planId} hasSubscription={hasSubscription} />
          ))}
        </div>
      </div>

      {/* --- Billing history --- */}
      {invoices.length > 0 && (
        <div>
          <h2 className="font-display text-lg mb-3">Billing history</h2>
          <div className="rounded-lg border border-line bg-surface overflow-hidden">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3 border-b border-line last:border-b-0 text-sm">
                <span className="text-ink">{formatDate(inv.date)}</span>
                <span className="text-muted font-mono">{formatCents(inv.amount)}</span>
                <span className="text-muted capitalize">{inv.status}</span>
                {inv.url ? (
                  <a href={inv.url} target="_blank" rel="noreferrer" className="text-accent font-medium">
                    Receipt →
                  </a>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanOptionCard({ id, isCurrent, hasSubscription }: { id: PlanId; isCurrent: boolean; hasSubscription: boolean }) {
  const plan = PLANS[id];
  return (
    <div className={`rounded-lg border p-4 flex flex-col ${isCurrent ? "border-accent bg-accent/5" : "border-line bg-surface"}`}>
      <p className="font-display text-base">{plan.name}</p>
      <p className="text-sm text-muted mb-3">${plan.priceUsd}/month</p>
      {isCurrent ? (
        <span className="mt-auto text-xs font-medium text-accent">Current plan</span>
      ) : hasSubscription ? (
        <form action={changePlanFormAction} className="mt-auto">
          <input type="hidden" name="planId" value={id} />
          <SubmitButton className="w-full rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper">
            Switch to {plan.name}
          </SubmitButton>
        </form>
      ) : (
        <form action={startCheckoutAction} className="mt-auto">
          <input type="hidden" name="planId" value={id} />
          <SubmitButton className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Start free trial
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const label = STATUS_LABELS[status] ?? status;
  const tone =
    status === "active" || status === "trialing"
      ? "bg-good/10 text-good"
      : status === "past_due"
        ? "bg-caution/10 text-caution"
        : "bg-risk/10 text-risk";
  return <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{label}</span>;
}

function Banner({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "good"
      ? "border-good/30 bg-good/5 text-ink"
      : tone === "warn"
        ? "border-caution/30 bg-caution/5 text-ink"
        : tone === "bad"
          ? "border-risk/30 bg-risk/5 text-ink"
          : "border-line bg-surface text-ink";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

function PortalLink({ label }: { label: string }) {
  return (
    <form action={openBillingPortalAction} className="inline">
      <button type="submit" className="text-accent font-medium underline">
        {label}
      </button>
    </form>
  );
}

function SubmitButton({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <button type="submit" className={className}>
      {children}
    </button>
  );
}
