import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { planIdFromStripePriceId } from "@/lib/billing/plans";

// Stripe requires the raw, unparsed request body to verify a webhook
// signature — Next.js must not pre-parse it as JSON, which is what this
// disables.
export const dynamic = "force-dynamic";

/**
 * The single inbound Stripe webhook receiver. Company.plan/subscriptionStatus/
 * currentPeriodEnd/etc are written ONLY here, from a signature-verified
 * event — never optimistically from a Checkout success redirect or any
 * other client-facing code path (spec: "The database should be
 * synchronized from verified Stripe events").
 *
 * Idempotent by construction: StripeWebhookEvent.id is the Stripe event id
 * itself, so a redelivered or dashboard-replayed event hits a duplicate
 * primary key and is treated as already-handled rather than re-applying a
 * plan change. The row is only written AFTER the event has been fully
 * processed — a crash mid-processing means Stripe retries (we return a
 * non-2xx), and the retry naturally finds no row yet and processes cleanly.
 */
export async function POST(request: Request): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set.");
    return new Response("Webhook not configured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const alreadyProcessed = await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } });
  if (alreadyProcessed) {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error(`[stripe webhook] failed to process ${event.type} (${event.id}):`, err);
    return new Response("Processing error", { status: 500 });
  }

  await prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });
  return Response.json({ received: true });
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      // Belt-and-suspenders self-healing: startCheckoutAction always creates
      // the Stripe customer and links it to the company BEFORE Checkout
      // starts, so this should be a no-op in practice. Kept so the
      // customer<->company link can never silently go missing if that
      // invariant is ever violated.
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = session.client_reference_id || session.metadata?.companyId;
      if (companyId && session.customer) {
        await prisma.company.updateMany({
          where: { id: companyId, stripeCustomerId: null },
          data: { stripeCustomerId: String(session.customer) },
        });
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscriptionToCompany(event.data.object as Stripe.Subscription);
      break;
    }

    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      // The subscription's own status (active / past_due / unpaid) is
      // authoritatively synced via customer.subscription.updated, which
      // Stripe always sends alongside these — nothing additional to persist
      // here. Logged only, for operator visibility.
      const invoice = event.data.object as Stripe.Invoice;
      console.log(`[stripe webhook] ${event.type}: invoice ${invoice.id}, customer ${String(invoice.customer)}`);
      break;
    }

    default:
      // Expected — Stripe sends far more event types than this app acts on.
      break;
  }
}

/** Reads current_period_end defensively across Stripe API-version shapes (it moved from the Subscription to the SubscriptionItem in newer API versions). */
function resolveCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const itemPeriodEnd = subscription.items.data[0]?.current_period_end;
  if (itemPeriodEnd) return new Date(itemPeriodEnd * 1000);
  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end;
  return legacy ? new Date(legacy * 1000) : null;
}

async function syncSubscriptionToCompany(subscription: Stripe.Subscription): Promise<void> {
  const companyId = subscription.metadata?.companyId;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const planId = priceId ? planIdFromStripePriceId(priceId) : null;

  const data = {
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    plan: planId,
    subscriptionStatus: subscription.status,
    currentPeriodEnd: resolveCurrentPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    ...(subscription.trial_end ? { trialEndsAt: new Date(subscription.trial_end * 1000) } : {}),
    stripeCustomerId: customerId,
  };

  const target = companyId
    ? await prisma.company.updateMany({ where: { id: companyId }, data })
    : await prisma.company.updateMany({ where: { stripeCustomerId: customerId }, data });

  if (target.count === 0) {
    console.error(
      `[stripe webhook] subscription ${subscription.id} (customer ${customerId}) matched no company — companyId metadata: ${companyId ?? "none"}`,
    );
  }
}
