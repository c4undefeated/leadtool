import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Lazily-constructed singleton Stripe client. Lazy (not module-top-level)
 * so importing this file never throws in a context where STRIPE_SECRET_KEY
 * genuinely isn't set yet (e.g. a build step) — the error only surfaces
 * when billing code actually runs.
 */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  cached = new Stripe(key);
  return cached;
}
