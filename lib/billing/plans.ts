/**
 * The single authoritative definition of IntentScout's paid plans — price,
 * limits, and marketing copy all live here and nowhere else. Every
 * server-side enforcement point (lib/billing/entitlements.ts) and every
 * customer-facing surface (pricing page, billing tab, upgrade prompts)
 * reads from this file rather than hardcoding a number or a name
 * independently, so a plan can never quietly drift out of sync with itself.
 *
 * Limits are deliberately framed around product capacity (campaigns, AI
 * analyses, engagement drafts, history) rather than provider mechanics
 * (Reddit/X API calls, Gemini tokens) — customers are never sold or shown
 * those internals; see lib/billing/entitlements.ts and ProviderUsageEvent
 * for where that internal cost governance actually lives, unchanged by this
 * file.
 */

export type PlanId = "starter" | "growth" | "pro";

export type PlanLimits = {
  /** Active campaigns a company may run at once (paused campaigns don't count). */
  maxActiveCampaigns: number;
  /** AI (Gemini) conversation analyses in a rolling ~30-day window. */
  maxAiAnalysesPerMonth: number;
  /** Engagement (comment/DM draft) generations in a rolling ~30-day window. */
  maxEngagementGenerationsPerMonth: number;
  /** How many days of opportunity history the feed/detail pages show. null = no limit. */
  historyDays: number | null;
};

export type PlanDefinition = {
  id: PlanId;
  name: string;
  priceUsd: number;
  mostPopular?: boolean;
  limits: PlanLimits;
  /** Customer-facing bullets only — outcomes, never provider/API internals. */
  features: string[];
  /** Env var holding this plan's live Stripe Price ID (see stripePriceIdForPlan). */
  stripePriceEnvVar: string;
};

export const PLAN_ORDER: PlanId[] = ["starter", "growth", "pro"];

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceUsd: 29,
    limits: {
      maxActiveCampaigns: 1,
      maxAiAnalysesPerMonth: 300,
      maxEngagementGenerationsPerMonth: 50,
      historyDays: 30,
    },
    features: [
      "Reddit + X/Twitter discovery",
      "Automatic daily scanning — no manual scans, ever",
      "AI-powered opportunity analysis: intent, fit, match & confidence scoring",
      "Safety classification and pain-point detection",
      "Full opportunity explanations, so you know why a lead matters",
      "AI-generated discovery vocabulary, tailored to your business",
      "Basic engagement guidance for reaching out",
      "1 active campaign",
      "30 days of opportunity history",
      "Standard support",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_STARTER",
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceUsd: 59,
    mostPopular: true,
    limits: {
      maxActiveCampaigns: 3,
      maxAiAnalysesPerMonth: 1000,
      maxEngagementGenerationsPerMonth: 200,
      historyDays: 90,
    },
    features: [
      "Everything in Starter",
      "3x the discovery & AI analysis capacity",
      "3 active campaigns",
      "Higher engagement-guidance allowance",
      "90 days of opportunity history",
      "Priority support",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_GROWTH",
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 99,
    limits: {
      maxActiveCampaigns: 10,
      maxAiAnalysesPerMonth: 3000,
      maxEngagementGenerationsPerMonth: 750,
      historyDays: null,
    },
    features: [
      "Everything in Growth",
      "Highest discovery & AI analysis capacity",
      "Up to 10 active campaigns",
      "Highest engagement-guidance allowance",
      "Full, unlimited opportunity history",
      "Priority support",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_PRO",
  },
};

/** Real Stripe subscription statuses that grant product access. */
export const ENTITLED_STATUSES = new Set(["trialing", "active", "past_due"]);

export const TRIAL_DAYS = 7;

// Deliberately much lower than even Starter's monthly caps — the trial's
// job is to prove the product works, not to run it at full capacity for
// free (spec: "Do NOT provide unlimited discovery during the trial").
// Applies regardless of which plan the trialing subscription is nominally
// attached to — a Pro trial gets the same trial cap as a Starter trial, so
// the choice of plan during trial only decides what they're billed once it
// converts, not how much they can use before then.
export const TRIAL_LIMITS: PlanLimits = {
  maxActiveCampaigns: 1,
  maxAiAnalysesPerMonth: 60,
  maxEngagementGenerationsPerMonth: 10,
  historyDays: 30,
};

/** No subscription at all — locked out until they subscribe. */
export const NO_PLAN_LIMITS: PlanLimits = {
  maxActiveCampaigns: 0,
  maxAiAnalysesPerMonth: 0,
  maxEngagementGenerationsPerMonth: 0,
  historyDays: 0,
};

export function planIdFromStripePriceId(priceId: string): PlanId | null {
  for (const plan of Object.values(PLANS)) {
    if (process.env[plan.stripePriceEnvVar] === priceId) return plan.id;
  }
  return null;
}

export function stripePriceIdForPlan(planId: PlanId): string {
  const envVar = PLANS[planId].stripePriceEnvVar;
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`${envVar} is not set — cannot start checkout for the ${PLANS[planId].name} plan.`);
  }
  return value;
}

export function isPlanId(value: string): value is PlanId {
  return value === "starter" || value === "growth" || value === "pro";
}
