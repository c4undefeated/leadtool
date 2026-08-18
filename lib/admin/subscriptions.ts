import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { PLANS, PLAN_ORDER, isPlanId, type PlanId } from "@/lib/billing/plans";

export type SubscriptionStatusCounts = Record<string, number>;

export type PlanDistributionRow = { planId: PlanId; name: string; count: number; mrrUsd: number };

export type AdminSubscriptionsSummary = {
  statusCounts: SubscriptionStatusCounts;
  planDistribution: PlanDistributionRow[];
  mrrUsd: number;
  totalPaying: number;
};

/** Aggregates Company's Stripe-synced fields — Company.subscriptionStatus/plan are themselves written only from verified Stripe webhook events (see app/api/webhooks/stripe/route.ts), so this IS the Stripe-sourced state, just read locally instead of re-querying Stripe for every company. */
export async function getSubscriptionsSummary(): Promise<AdminSubscriptionsSummary> {
  const grouped = await prisma.company.groupBy({
    by: ["subscriptionStatus", "plan"],
    _count: true,
  });

  const statusCounts: SubscriptionStatusCounts = {};
  const planCounts = new Map<PlanId, number>();
  let mrrUsd = 0;
  let totalPaying = 0;

  for (const row of grouped) {
    const status = row.subscriptionStatus ?? "none";
    statusCounts[status] = (statusCounts[status] ?? 0) + row._count;
    if (row.plan && isPlanId(row.plan) && (status === "active" || status === "past_due" || status === "trialing")) {
      planCounts.set(row.plan, (planCounts.get(row.plan) ?? 0) + row._count);
    }
    if (row.plan && isPlanId(row.plan) && (status === "active" || status === "past_due")) {
      mrrUsd += PLANS[row.plan].priceUsd * row._count;
      totalPaying += row._count;
    }
  }

  const planDistribution: PlanDistributionRow[] = PLAN_ORDER.map((id) => ({
    planId: id,
    name: PLANS[id].name,
    count: planCounts.get(id) ?? 0,
    mrrUsd: PLANS[id].priceUsd * (planCounts.get(id) ?? 0),
  }));

  return { statusCounts, planDistribution, mrrUsd, totalPaying };
}

export type RecentStripeEvent = {
  id: string;
  type: string;
  createdAt: Date;
  summary: string;
};

/**
 * Live read from Stripe's own Events API for "recent upgrades/downgrades/
 * failed payments" — deliberately NOT reconstructed from
 * StripeWebhookEvent (that table only stores id/type/timestamp for
 * idempotency, not enough detail to describe a change), and deliberately
 * not a new locally-stored event log either (spec: "do not create a
 * competing billing system"). Read-only, bounded to the most recent N
 * events, no write path touched.
 */
export async function getRecentStripeEvents(limit = 20): Promise<RecentStripeEvent[]> {
  if (!process.env.STRIPE_SECRET_KEY) return [];
  const stripe = getStripe();
  const types = [
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
    "charge.refunded",
  ];

  const results = await Promise.allSettled(
    types.map((type) => stripe.events.list({ type, limit: 10 })),
  );

  const events: Stripe.Event[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") events.push(...r.value.data);
  }
  events.sort((a, b) => b.created - a.created);

  return events.slice(0, limit).map((e) => ({
    id: e.id,
    type: e.type,
    createdAt: new Date(e.created * 1000),
    summary: summarizeStripeEvent(e),
  }));
}

function summarizeStripeEvent(event: Stripe.Event): string {
  switch (event.type) {
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const price = sub.items.data[0]?.price.id;
      const planId = price ? Object.values(PLANS).find((p) => process.env[p.stripePriceEnvVar] === price)?.name : undefined;
      return `Subscription updated${planId ? ` → ${planId}` : ""} (status: ${sub.status}, cancel_at_period_end: ${sub.cancel_at_period_end})`;
    }
    case "customer.subscription.deleted":
      return "Subscription canceled";
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      return `Payment failed for invoice ${invoice.id ?? ""}`.trim();
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      return `Refund issued: $${(charge.amount_refunded / 100).toFixed(2)}`;
    }
    default:
      return event.type;
  }
}
