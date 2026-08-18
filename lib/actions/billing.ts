"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { ENTITLED_STATUSES, PLANS, TRIAL_DAYS, isPlanId, stripePriceIdForPlan, type PlanId } from "@/lib/billing/plans";

export type BillingActionState = { error?: string } | undefined;

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  return `${protocol}://${host}`;
}

async function ownedCompanyOrThrow() {
  const user = await requireUser();
  if (!user.companyId) throw new Error("No company on this account.");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });
  return { user, company };
}

function planIdFromFormData(formData: FormData): PlanId {
  const raw = String(formData.get("planId") || "");
  if (!isPlanId(raw)) throw new Error("Unknown plan.");
  return raw;
}

/**
 * Starts a new Stripe Checkout session for the given plan. A company
 * already on an entitled subscription is redirected to the billing tab
 * instead of starting a second one — plan changes go through
 * changePlanAction, never a second Checkout (spec: "Prevent users from
 * accidentally creating multiple active subscriptions").
 */
export async function startCheckoutAction(formData: FormData): Promise<void> {
  const planId = planIdFromFormData(formData);
  const { user, company } = await ownedCompanyOrThrow();

  if (company.subscriptionStatus && ENTITLED_STATUSES.has(company.subscriptionStatus)) {
    redirect("/settings/billing?notice=already_subscribed");
  }

  const stripe = getStripe();
  const origin = await getOrigin();

  let customerId = company.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: company.name,
      metadata: { companyId: company.id },
    });
    customerId = customer.id;
    await prisma.company.update({ where: { id: company.id }, data: { stripeCustomerId: customerId } });
  }

  // Only companies who have never trialed before get a free trial —
  // trialEndsAt is set once at first trial start and never cleared, so it
  // doubles as "has this company ever trialed" (see prisma/schema.prisma).
  const eligibleForTrial = !company.trialEndsAt;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: stripePriceIdForPlan(planId), quantity: 1 }],
    subscription_data: {
      ...(eligibleForTrial ? { trial_period_days: TRIAL_DAYS } : {}),
      metadata: { companyId: company.id, planId },
    },
    client_reference_id: company.id,
    metadata: { companyId: company.id, planId },
    success_url: `${origin}/settings/billing?checkout=success`,
    cancel_url: `${origin}/settings/billing?checkout=canceled`,
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  redirect(session.url);
}

/**
 * Upgrade or downgrade an existing subscription in place — updates the one
 * Stripe subscription's price rather than ever creating a second
 * subscription. Standard Stripe proration applies; no bespoke billing
 * policy exists for this product yet, so this deliberately uses Stripe's
 * default ("create_prorations") rather than inventing one.
 */
export async function changePlanAction(formData: FormData): Promise<BillingActionState> {
  const planId = planIdFromFormData(formData);
  const { company } = await ownedCompanyOrThrow();
  if (!company.stripeSubscriptionId) return { error: "No active subscription to change." };
  if (company.plan === planId) return { error: `You're already on the ${PLANS[planId].name} plan.` };

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(company.stripeSubscriptionId);
  const item = subscription.items.data[0];
  if (!item) return { error: "Your subscription has no billing item to change." };

  await stripe.subscriptions.update(company.stripeSubscriptionId, {
    items: [{ id: item.id, price: stripePriceIdForPlan(planId) }],
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
  });

  // The DB is intentionally NOT updated here — it's synced authoritatively
  // from the customer.subscription.updated webhook Stripe sends for this
  // change (see app/api/webhooks/stripe/route.ts), matching "never grant
  // paid access based solely on a frontend redirect."
  revalidatePath("/settings/billing");
  return undefined;
}

export async function cancelSubscriptionAction(): Promise<BillingActionState> {
  const { company } = await ownedCompanyOrThrow();
  if (!company.stripeSubscriptionId) return { error: "No active subscription to cancel." };

  const stripe = getStripe();
  await stripe.subscriptions.update(company.stripeSubscriptionId, { cancel_at_period_end: true });
  revalidatePath("/settings/billing");
  return undefined;
}

export async function reactivateSubscriptionAction(): Promise<BillingActionState> {
  const { company } = await ownedCompanyOrThrow();
  if (!company.stripeSubscriptionId) return { error: "No subscription to reactivate." };

  const stripe = getStripe();
  await stripe.subscriptions.update(company.stripeSubscriptionId, { cancel_at_period_end: false });
  revalidatePath("/settings/billing");
  return undefined;
}

// --- void-returning wrappers for direct <form action={...}> binding -------
// A plain <form action={fn}> (no useActionState) requires fn to return
// void|Promise<void> — these adapt the BillingActionState-returning actions
// above (kept that shape for a future useActionState upgrade) by redirecting
// with a ?notice= on failure instead of returning a value nothing reads,
// matching the same notice-banner convention used on the campaign page.

export async function changePlanFormAction(formData: FormData): Promise<void> {
  const result = await changePlanAction(formData);
  if (result?.error) redirect(`/settings/billing?notice=${encodeURIComponent(result.error)}`);
}

export async function cancelSubscriptionFormAction(): Promise<void> {
  const result = await cancelSubscriptionAction();
  if (result?.error) redirect(`/settings/billing?notice=${encodeURIComponent(result.error)}`);
}

export async function reactivateSubscriptionFormAction(): Promise<void> {
  const result = await reactivateSubscriptionAction();
  if (result?.error) redirect(`/settings/billing?notice=${encodeURIComponent(result.error)}`);
}

/** Hands off to Stripe's own Customer Portal for payment-method and invoice management. */
export async function openBillingPortalAction(): Promise<void> {
  const { company } = await ownedCompanyOrThrow();
  if (!company.stripeCustomerId) throw new Error("No billing account yet — subscribe to a plan first.");

  const stripe = getStripe();
  const origin = await getOrigin();
  const session = await stripe.billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: `${origin}/settings/billing`,
  });
  redirect(session.url);
}
