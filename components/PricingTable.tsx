import Link from "next/link";
import { PLAN_ORDER, PLANS, type PlanId } from "@/lib/billing/plans";
import { startCheckoutAction } from "@/lib/actions/billing";

/**
 * Renders the three plans from lib/billing/plans.ts — the same object the
 * entitlement/checkout code reads, so this page can never drift out of sync
 * with what a customer is actually charged or actually gets.
 *
 * `authenticated` decides what the CTA does: a signed-in company with an
 * offer profile goes straight to Stripe Checkout (startCheckoutAction); an
 * anonymous visitor goes to signup first, carrying the chosen plan through
 * so it's preselected once they reach billing.
 */
export function PricingTable({ authenticated }: { authenticated: boolean }) {
  return (
    <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
      {PLAN_ORDER.map((id) => {
        const plan = PLANS[id];
        return (
          <div
            key={id}
            className={`relative rounded-xl border bg-surface p-6 flex flex-col ${
              plan.mostPopular ? "border-accent shadow-lg shadow-accent/10 md:-translate-y-2" : "border-line"
            }`}
          >
            {plan.mostPopular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white whitespace-nowrap">
                Most Popular
              </span>
            )}
            <h3 className="font-display text-xl">{plan.name}</h3>
            <p className="mt-2">
              <span className="text-3xl font-display">${plan.priceUsd}</span>
              <span className="text-muted text-sm">/month</span>
            </p>
            <ul className="mt-5 flex flex-col gap-2.5 text-sm text-ink flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <CheckIcon className="shrink-0 mt-0.5 text-accent" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <PlanCta planId={id} mostPopular={!!plan.mostPopular} authenticated={authenticated} />
          </div>
        );
      })}
    </div>
  );
}

function PlanCta({ planId, mostPopular, authenticated }: { planId: PlanId; mostPopular: boolean; authenticated: boolean }) {
  const className = `mt-6 block w-full text-center rounded-md px-4 py-2.5 text-sm font-medium transition ${
    mostPopular ? "bg-accent text-white hover:opacity-90" : "border border-line text-ink hover:bg-paper"
  }`;

  if (!authenticated) {
    return (
      <Link href={`/signup?plan=${planId}`} className={className}>
        Start 7-day free trial
      </Link>
    );
  }

  return (
    <form action={startCheckoutAction}>
      <input type="hidden" name="planId" value={planId} />
      <button type="submit" className={className}>
        Start 7-day free trial
      </button>
    </form>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
