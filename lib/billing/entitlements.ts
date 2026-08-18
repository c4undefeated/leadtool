import { prisma } from "@/lib/prisma";
import {
  ENTITLED_STATUSES,
  NO_PLAN_LIMITS,
  PLANS,
  TRIAL_DAYS,
  TRIAL_LIMITS,
  isPlanId,
  type PlanId,
  type PlanLimits,
} from "@/lib/billing/plans";

export type CompanyBillingFields = {
  id: string;
  plan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type CompanyEntitlements = {
  companyId: string;
  planId: PlanId | null;
  status: string | null;
  /** True if the company currently has product access (trialing/active/past_due). */
  isEntitled: boolean;
  isTrialing: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
  hasEverTrialed: boolean;
  /** The limits actually in force right now — trial limits while trialing, plan limits once paid, all-zero with no subscription. */
  limits: PlanLimits;
  /** Rolling usage-window start these limits are measured against. */
  periodStart: Date;
};

/**
 * The one function everything else in the app calls to find out what a
 * company can currently do. Reads Company's Stripe-synced fields (written
 * only by app/api/webhooks/stripe/route.ts) — never trusts anything from
 * the client, a URL parameter, or a cached session value.
 */
export async function getCompanyEntitlements(companyId: string): Promise<CompanyEntitlements> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });
  if (!company) {
    return {
      companyId,
      planId: null,
      status: null,
      isEntitled: false,
      isTrialing: false,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      hasStripeCustomer: false,
      hasEverTrialed: false,
      limits: NO_PLAN_LIMITS,
      periodStart: new Date(),
    };
  }
  return resolveEntitlements(company);
}

/** Pure — no I/O — so it's directly unit-testable without a live database. */
export function resolveEntitlements(company: CompanyBillingFields): CompanyEntitlements {
  const status = company.subscriptionStatus;
  const isEntitled = status !== null && ENTITLED_STATUSES.has(status);
  const isTrialing = status === "trialing";
  const planId = company.plan && isPlanId(company.plan) ? company.plan : null;

  let limits: PlanLimits;
  let periodStart: Date;

  if (!isEntitled) {
    limits = NO_PLAN_LIMITS;
    periodStart = new Date();
  } else if (isTrialing) {
    limits = TRIAL_LIMITS;
    // Trial usage is capped over the WHOLE trial, not per rolling 30 days —
    // derive the trial's start from its end (trialEndsAt - TRIAL_DAYS)
    // rather than adding a redundant trialStartedAt column, since the two
    // are always TRIAL_DAYS apart by construction (see startCheckoutAction).
    periodStart = company.trialEndsAt
      ? new Date(company.trialEndsAt.getTime() - TRIAL_DAYS * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - TRIAL_DAYS * 24 * 60 * 60 * 1000);
  } else {
    limits = planId ? PLANS[planId].limits : NO_PLAN_LIMITS;
    // "Per month" is approximated as a rolling ~30 days anchored to the
    // current billing period's end, rather than tracking an exact Stripe
    // period-start timestamp — Stripe's real monthly periods run 28-31
    // days, and that variance doesn't matter for a soft usage cap. Good
    // enough to answer "how much have they used this billing cycle,"
    // deliberately not precise enough to reconcile against an invoice line.
    periodStart = company.currentPeriodEnd
      ? new Date(company.currentPeriodEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  return {
    companyId: company.id,
    planId,
    status,
    isEntitled,
    isTrialing,
    trialEndsAt: company.trialEndsAt,
    currentPeriodEnd: company.currentPeriodEnd,
    cancelAtPeriodEnd: company.cancelAtPeriodEnd,
    hasStripeCustomer: !!company.stripeCustomerId,
    hasEverTrialed: !!company.trialEndsAt,
    limits,
    periodStart,
  };
}

// --- Usage counters -------------------------------------------------------
// Deliberately count product-facing units (analyses, engagement drafts,
// active campaigns) rather than raw provider calls — ProviderUsageEvent
// remains the internal cost ledger, untouched by any of this.

export async function countActiveCampaigns(companyId: string): Promise<number> {
  return prisma.campaign.count({ where: { companyId, status: "active" } });
}

export async function countAiAnalysesSince(companyId: string, since: Date): Promise<number> {
  return prisma.conversation.count({
    where: { campaign: { companyId }, analyzedAt: { gte: since } },
  });
}

export async function countEngagementGenerationsSince(companyId: string, since: Date): Promise<number> {
  return prisma.engagementRecommendation.count({
    where: { opportunity: { conversation: { campaign: { companyId } } }, createdAt: { gte: since } },
  });
}

// --- Enforcement helpers ---------------------------------------------------

export type EntitlementCheck =
  | { allowed: true }
  | { allowed: false; reason: string; upgradeTo: PlanId | null };

/** Smallest plan (in PLAN_ORDER) whose limit for `key` exceeds `atLeast`, or null if even Pro can't. */
function cheapestPlanWithHigherLimit(key: keyof PlanLimits, atLeast: number): PlanId | null {
  for (const id of ["starter", "growth", "pro"] as PlanId[]) {
    const limit = PLANS[id].limits[key];
    if (limit === null || limit > atLeast) return id;
  }
  return null;
}

export async function checkCampaignCreationAllowed(companyId: string): Promise<EntitlementCheck> {
  const entitlements = await getCompanyEntitlements(companyId);
  if (!entitlements.isEntitled) {
    return { allowed: false, reason: "Subscribe to a plan to create campaigns.", upgradeTo: "starter" };
  }
  const active = await countActiveCampaigns(companyId);
  if (active < entitlements.limits.maxActiveCampaigns) return { allowed: true };
  return {
    allowed: false,
    reason: `Your plan allows ${entitlements.limits.maxActiveCampaigns} active campaign${entitlements.limits.maxActiveCampaigns === 1 ? "" : "s"}. Pause one, or upgrade for more.`,
    upgradeTo: cheapestPlanWithHigherLimit("maxActiveCampaigns", entitlements.limits.maxActiveCampaigns),
  };
}

export async function checkEngagementGenerationAllowed(companyId: string): Promise<EntitlementCheck> {
  const entitlements = await getCompanyEntitlements(companyId);
  if (!entitlements.isEntitled) {
    return { allowed: false, reason: "Subscribe to a plan to generate engagement guidance.", upgradeTo: "starter" };
  }
  const used = await countEngagementGenerationsSince(companyId, entitlements.periodStart);
  if (used < entitlements.limits.maxEngagementGenerationsPerMonth) return { allowed: true };
  return {
    allowed: false,
    reason: entitlements.isTrialing
      ? "You've used your trial's engagement-guidance allowance. Subscribe to keep going."
      : "You've reached this month's engagement-guidance limit. Upgrade for a higher allowance.",
    upgradeTo: entitlements.isTrialing
      ? null
      : cheapestPlanWithHigherLimit("maxEngagementGenerationsPerMonth", entitlements.limits.maxEngagementGenerationsPerMonth),
  };
}

/**
 * Used by lib/dailyScan.ts's candidate filter — a company that is either
 * unentitled (no subscription, canceled, unpaid, incomplete) or already over
 * its monthly/trial AI-analysis allowance is simply never claimed for a
 * scan this run. Deliberately does not touch runScanForCampaign or the
 * claim/lease locking itself — see lib/dailyScan.ts's own doc comment for
 * why that boundary matters.
 */
export async function isCompanyEligibleForScanning(companyId: string): Promise<boolean> {
  const entitlements = await getCompanyEntitlements(companyId);
  if (!entitlements.isEntitled) return false;
  const used = await countAiAnalysesSince(companyId, entitlements.periodStart);
  return used < entitlements.limits.maxAiAnalysesPerMonth;
}

export function historyCutoff(historyDays: number | null): Date | null {
  if (historyDays === null) return null;
  return new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000);
}
