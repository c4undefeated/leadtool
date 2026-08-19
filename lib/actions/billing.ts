"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { ENTITLED_STATUSES, PLANS, TRIAL_DAYS, isPlanId, stripePriceIdForPlan, type PlanId } from "@/lib/billing/plans";
import { getBetaSettings } from "@/lib/beta";

export type BillingActionState = { error?: string } | undefined;

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  return `${protocol}://${host}`;
}

/** One Stripe subscription per ACCOUNT (spec: multi-business support) — never per business. */
async function ownedAccountOrThrow() {
  const user = await requireUser();
  if (!user.accountId) throw new Error("No account on this login.");
  const account = await prisma.account.findUniqueOrThrow({ where: { id: user.accountId } });
  return { user, account };
}

function planIdFromFormData(formData: FormData): PlanId {
  const raw = String(formData.get("planId") || "");
  if (!isPlanId(raw)) throw new Error("Unknown plan.");
  return raw;
}

/**
 * Starts a new Stripe Checkout session for the given plan. An account
 * already on an entitled subscription is redirected to the billing tab
 * instead of starting a second one — plan changes go through
 * changePlanAction, never a second Checkout (spec: "Prevent users from
 * accidentally creating multiple active subscriptions").
 */
export async function startCheckoutAction(formData: FormData): Promise<void> {
  const planId = planIdFromFormData(formData);
  const { user, account } = await ownedAccountOrThrow();

  // Beta Mode (spec: "IntentScout — Beta Mode / Controlled Manual
  // Scanning" section 7): no new billing activity while beta testing is
  // active. Checked server-side, before any Stripe API call — a direct
  // POST to this action bypasses nothing, since hiding the button
  // client-side was never the enforcement. Never touches an existing
  // subscription (changePlanAction/cancelSubscriptionAction/
  // reactivateSubscriptionAction are untouched) — only blocks starting a
  // NEW one.
  const betaSettings = await getBetaSettings();
  if (betaSettings.enabled) {
    redirect(`/settings/billing?notice=${encodeURIComponent("IntentScout is currently in beta. Paid subscriptions and free trials are temporarily unavailable.")}`);
  }

  if (account.subscriptionStatus && ENTITLED_STATUSES.has(account.subscriptionStatus)) {
    redirect("/settings/billing?notice=already_subscribed");
  }

  const stripe = getStripe();
  const origin = await getOrigin();

  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || user.email,
      metadata: { accountId: account.id },
    });
    customerId = customer.id;
    await prisma.account.update({ where: { id: account.id }, data: { stripeCustomerId: customerId } });
  }

  // Only accounts who have never trialed before get a free trial —
  // trialEndsAt is set once at first trial start and never cleared, so it
  // doubles as "has this account ever trialed" (see prisma/schema.prisma).
  const eligibleForTrial = !account.trialEndsAt;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: stripePriceIdForPlan(planId), quantity: 1 }],
    subscription_data: {
      ...(eligibleForTrial ? { trial_period_days: TRIAL_DAYS } : {}),
      metadata: { accountId: account.id, planId },
    },
    client_reference_id: account.id,
    metadata: { accountId: account.id, planId },
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
 *
 * Downgrading never deletes businesses or data even if the account now
 * has more businesses than the new plan allows — lib/billing/entitlements.ts's
 * checkBusinessCreationAllowed simply blocks creating MORE, the same way
 * every other over-limit case in this app already works. Nothing here (or
 * anywhere else) deletes a Company on downgrade.
 */
export async function changePlanAction(formData: FormData): Promise<BillingActionState> {
  const planId = planIdFromFormData(formData);
  const { account } = await ownedAccountOrThrow();
  if (!account.stripeSubscriptionId) return { error: "No active subscription to change." };
  if (account.plan === planId) return { error: `You're already on the ${PLANS[planId].name} plan.` };

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(account.stripeSubscriptionId);
  const item = subscription.items.data[0];
  if (!item) return { error: "Your subscription has no billing item to change." };

  await stripe.subscriptions.update(account.stripeSubscriptionId, {
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
  const { account } = await ownedAccountOrThrow();
  if (!account.stripeSubscriptionId) return { error: "No active subscription to cancel." };

  const stripe = getStripe();
  await stripe.subscriptions.update(account.stripeSubscriptionId, { cancel_at_period_end: true });
  revalidatePath("/settings/billing");
  return undefined;
}

export async function reactivateSubscriptionAction(): Promise<BillingActionState> {
  const { account } = await ownedAccountOrThrow();
  if (!account.stripeSubscriptionId) return { error: "No subscription to reactivate." };

  const stripe = getStripe();
  await stripe.subscriptions.update(account.stripeSubscriptionId, { cancel_at_period_end: false });
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
  const { account } = await ownedAccountOrThrow();
  if (!account.stripeCustomerId) throw new Error("No billing account yet — subscribe to a plan first.");

  const stripe = getStripe();
  const origin = await getOrigin();
  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${origin}/settings/billing`,
  });
  redirect(session.url);
}
