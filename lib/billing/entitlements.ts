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

export type AccountBillingFields = {
  id: string;
  plan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type AccountEntitlements = {
  accountId: string;
  planId: PlanId | null;
  status: string | null;
  /** True if the account currently has product access (trialing/active/past_due). */
  isEntitled: boolean;
  isTrialing: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
  hasEverTrialed: boolean;
  /** The limits actually in force right now — trial limits while trialing, plan limits once paid, all-zero with no subscription. Most fields are per-business; maxBusinesses is the one account-wide exception (see PlanLimits). */
  limits: PlanLimits;
  /** Rolling usage-window start these per-business limits are measured against. */
  periodStart: Date;
};

/**
 * The one function everything else in the app calls to find out what an
 * ACCOUNT (the subscription owner — see prisma/schema.prisma's Account
 * doc comment) can currently do. Reads Account's Stripe-synced fields
 * (written only by app/api/webhooks/stripe/route.ts) — never trusts
 * anything from the client, a URL parameter, or a cached session value.
 */
export async function getAccountEntitlements(accountId: string): Promise<AccountEntitlements> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
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
  if (!account) {
    return {
      accountId,
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
  return resolveEntitlements(account);
}

/**
 * Convenience wrapper for the many call sites that only have a business
 * (Company) id in hand, not the owning account id directly — resolves the
 * business's account, then its entitlements. A business with no account
 * (should never happen; every Company row has a required accountId) or a
 * business that doesn't exist gets the same locked-out NO_PLAN_LIMITS
 * result as an account with no subscription.
 */
export async function getCompanyEntitlements(companyId: string): Promise<AccountEntitlements> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountId: true } });
  if (!company) {
    return {
      accountId: "",
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
  return getAccountEntitlements(company.accountId);
}

/** Pure — no I/O — so it's directly unit-testable without a live database. */
export function resolveEntitlements(account: AccountBillingFields): AccountEntitlements {
  const status = account.subscriptionStatus;
  const isEntitled = status !== null && ENTITLED_STATUSES.has(status);
  const isTrialing = status === "trialing";
  const planId = account.plan && isPlanId(account.plan) ? account.plan : null;

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
    periodStart = account.trialEndsAt
      ? new Date(account.trialEndsAt.getTime() - TRIAL_DAYS * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - TRIAL_DAYS * 24 * 60 * 60 * 1000);
  } else {
    limits = planId ? PLANS[planId].limits : NO_PLAN_LIMITS;
    // "Per month" is approximated as a rolling ~30 days anchored to the
    // current billing period's end, rather than tracking an exact Stripe
    // period-start timestamp — Stripe's real monthly periods run 28-31
    // days, and that variance doesn't matter for a soft usage cap. Good
    // enough to answer "how much have they used this billing cycle,"
    // deliberately not precise enough to reconcile against an invoice line.
    periodStart = account.currentPeriodEnd
      ? new Date(account.currentPeriodEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  return {
    accountId: account.id,
    planId,
    status,
    isEntitled,
    isTrialing,
    trialEndsAt: account.trialEndsAt,
    currentPeriodEnd: account.currentPeriodEnd,
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
    hasStripeCustomer: !!account.stripeCustomerId,
    hasEverTrialed: !!account.trialEndsAt,
    limits,
    periodStart,
  };
}

// --- Usage counters -------------------------------------------------------
// Per-business (Company), unchanged from before multi-business support —
// deliberately count product-facing units (analyses, engagement drafts,
// active campaigns) rather than raw provider calls. ProviderUsageEvent
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
    where: { opportunity: { conversation: { campaign: { companyId } } } },
  });
}

/** Account-wide — the one limit dimension that isn't per-business. */
export async function countBusinesses(accountId: string): Promise<number> {
  return prisma.company.count({ where: { accountId } });
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
 * Account-wide business-count cap (spec: multi-business support). Checked
 * before creating a new Company under an account — see
 * lib/actions/business.ts's createBusinessAction. The account's existing
 * default business (created at signup) always counts toward this limit
 * like any other.
 */
export async function checkBusinessCreationAllowed(accountId: string): Promise<EntitlementCheck> {
  const entitlements = await getAccountEntitlements(accountId);
  if (!entitlements.isEntitled) {
    return { allowed: false, reason: "Subscribe to a plan to add another business.", upgradeTo: "starter" };
  }
  const count = await countBusinesses(accountId);
  if (count < entitlements.limits.maxBusinesses) return { allowed: true };
  return {
    allowed: false,
    reason: `You've reached the ${entitlements.limits.maxBusinesses}-business limit on your current plan.`,
    upgradeTo: cheapestPlanWithHigherLimit("maxBusinesses", entitlements.limits.maxBusinesses),
  };
}

/**
 * Used by lib/dailyScan.ts's candidate filter — a company whose owning
 * account is either unentitled (no subscription, canceled, unpaid,
 * incomplete) or already over its monthly/trial AI-analysis allowance is
 * simply never claimed for a scan this run. Deliberately does not touch
 * runScanForCampaign or the claim/lease locking itself — see
 * lib/dailyScan.ts's own doc comment for why that boundary matters.
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
