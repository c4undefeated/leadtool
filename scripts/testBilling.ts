/**
 * Deterministic, pure-logic checks for the billing/entitlement system:
 * plan<->Stripe-Price-ID resolution (lib/billing/plans.ts) and entitlement/
 * limit resolution from a company's Stripe-synced fields
 * (lib/billing/entitlements.ts's resolveEntitlements). No network, no
 * database, no Stripe key needed.
 *
 * What this deliberately does NOT cover (needs a live database and/or a
 * real Stripe test-mode account): startCheckoutAction/changePlanAction/
 * cancelSubscriptionAction end-to-end, the Stripe webhook handler's
 * signature verification and idempotency against a real redelivered event,
 * and the usage-counter queries (countActiveCampaigns/countAiAnalysesSince/
 * countEngagementGenerationsSince) against real rows. Those need live
 * sandbox verification the same way prior phases of this codebase verified
 * DB-dependent behavior.
 *
 * Run with: npx tsx scripts/testBilling.ts
 */
import { PLANS, isPlanId, planIdFromStripePriceId, stripePriceIdForPlan, TRIAL_LIMITS, NO_PLAN_LIMITS } from "@/lib/billing/plans";
import { resolveEntitlements, type AccountBillingFields } from "@/lib/billing/entitlements";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(id: string, condition: boolean, detail: string) {
  process.stdout.write(`  ${id.padEnd(70)} `);
  if (condition) {
    pass += 1;
    console.log("PASS");
  } else {
    fail += 1;
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${detail}`);
  }
}

function baseAccount(overrides: Partial<AccountBillingFields> = {}): AccountBillingFields {
  return {
    id: "acct_test",
    plan: null,
    subscriptionStatus: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    ...overrides,
  };
}

function main() {
  console.log("Running billing pure-logic checks...\n");

  // --- plans.ts: price <-> plan resolution ---
  process.env.STRIPE_PRICE_STARTER = "price_starter_test";
  process.env.STRIPE_PRICE_GROWTH = "price_growth_test";
  process.env.STRIPE_PRICE_PRO = "price_pro_test";

  check("planIdFromStripePriceId: resolves starter", planIdFromStripePriceId("price_starter_test") === "starter", "expected starter");
  check("planIdFromStripePriceId: resolves growth", planIdFromStripePriceId("price_growth_test") === "growth", "expected growth");
  check("planIdFromStripePriceId: resolves pro", planIdFromStripePriceId("price_pro_test") === "pro", "expected pro");
  check("planIdFromStripePriceId: unknown price id -> null", planIdFromStripePriceId("price_does_not_exist") === null, "expected null");

  check("stripePriceIdForPlan: round-trips starter", stripePriceIdForPlan("starter") === "price_starter_test", "expected price_starter_test");

  delete process.env.STRIPE_PRICE_STARTER;
  let threw = false;
  try {
    stripePriceIdForPlan("starter");
  } catch {
    threw = true;
  }
  check("stripePriceIdForPlan: throws a clear error when the env var is unset", threw, "expected a thrown error, not a silent undefined price id");
  process.env.STRIPE_PRICE_STARTER = "price_starter_test";

  check("isPlanId: accepts starter/growth/pro", isPlanId("starter") && isPlanId("growth") && isPlanId("pro"), "expected all true");
  check("isPlanId: rejects garbage", !isPlanId("enterprise") && !isPlanId(""), "expected both false");

  // --- Plan limits are strictly increasing (Growth > Starter, Pro > Growth) ---
  // A pricing mistake here (e.g. Growth accidentally capped below Starter)
  // would silently make an upgrade a downgrade — this guards against that.
  const dims = ["maxActiveCampaigns", "maxAiAnalysesPerMonth", "maxEngagementGenerationsPerMonth", "maxBusinesses"] as const;
  for (const dim of dims) {
    check(
      `plan ordering: growth.${dim} > starter.${dim}`,
      PLANS.growth.limits[dim] > PLANS.starter.limits[dim],
      `growth=${PLANS.growth.limits[dim]} starter=${PLANS.starter.limits[dim]}`,
    );
    check(
      `plan ordering: pro.${dim} > growth.${dim}`,
      PLANS.pro.limits[dim] > PLANS.growth.limits[dim],
      `pro=${PLANS.pro.limits[dim]} growth=${PLANS.growth.limits[dim]}`,
    );
  }
  check("plan pricing: starter < growth < pro", PLANS.starter.priceUsd < PLANS.growth.priceUsd && PLANS.growth.priceUsd < PLANS.pro.priceUsd, "expected strictly increasing price");
  check("growth is the only plan marked mostPopular", !!PLANS.growth.mostPopular && !PLANS.starter.mostPopular && !PLANS.pro.mostPopular, "expected only growth.mostPopular === true");

  // --- Multi-business support: exact business limits per spec ---
  check("Starter allows exactly 1 business", PLANS.starter.limits.maxBusinesses === 1, `got ${PLANS.starter.limits.maxBusinesses}`);
  check("Growth allows exactly 3 businesses", PLANS.growth.limits.maxBusinesses === 3, `got ${PLANS.growth.limits.maxBusinesses}`);
  check("Pro allows exactly 10 businesses", PLANS.pro.limits.maxBusinesses === 10, `got ${PLANS.pro.limits.maxBusinesses}`);
  check("Trial allows exactly 1 business regardless of underlying plan", TRIAL_LIMITS.maxBusinesses === 1, `got ${TRIAL_LIMITS.maxBusinesses}`);
  check("No subscription allows 0 businesses (locked out until subscribed)", NO_PLAN_LIMITS.maxBusinesses === 0, `got ${NO_PLAN_LIMITS.maxBusinesses}`);

  // --- resolveEntitlements ---
  const noSub = resolveEntitlements(baseAccount());
  check("no subscription: not entitled", noSub.isEntitled === false, "expected false");
  check("no subscription: zero limits (locked out, not silently capacity-1)", noSub.limits.maxActiveCampaigns === 0, "expected 0");
  check("no subscription: zero business limit too", noSub.limits.maxBusinesses === 0, "expected 0");

  const trialing = resolveEntitlements(
    baseAccount({ plan: "pro", subscriptionStatus: "trialing", trialEndsAt: new Date("2026-08-25T00:00:00Z") }),
  );
  check("trialing: entitled", trialing.isEntitled === true, "expected true");
  check("trialing: isTrialing flag set", trialing.isTrialing === true, "expected true");
  check(
    "trialing on the Pro plan still gets TRIAL limits, not Pro's full limits",
    trialing.limits.maxAiAnalysesPerMonth < PLANS.pro.limits.maxAiAnalysesPerMonth,
    `trial limit ${trialing.limits.maxAiAnalysesPerMonth} should be well under Pro's ${PLANS.pro.limits.maxAiAnalysesPerMonth}`,
  );
  check(
    "trialing on the Pro plan still gets TRIAL business limit, not Pro's 10",
    trialing.limits.maxBusinesses === 1,
    `trial business limit ${trialing.limits.maxBusinesses} should be 1, not Pro's ${PLANS.pro.limits.maxBusinesses}`,
  );
  check(
    "trialing: periodStart is exactly TRIAL_DAYS before trialEndsAt",
    trialing.periodStart.getTime() === new Date("2026-08-25T00:00:00Z").getTime() - 7 * 24 * 60 * 60 * 1000,
    "expected trialEndsAt - 7 days",
  );

  const active = resolveEntitlements(
    baseAccount({ plan: "growth", subscriptionStatus: "active", currentPeriodEnd: new Date("2026-09-01T00:00:00Z") }),
  );
  check("active: entitled", active.isEntitled === true, "expected true");
  check("active: uses the plan's real limits, not trial limits", active.limits.maxActiveCampaigns === PLANS.growth.limits.maxActiveCampaigns, "expected Growth's real limit");

  const pastDue = resolveEntitlements(baseAccount({ plan: "starter", subscriptionStatus: "past_due" }));
  check(
    "past_due: still entitled (grace period during payment retry, not an immediate cutoff)",
    pastDue.isEntitled === true,
    "expected true — see report for this as a deliberate, reviewable policy choice",
  );

  const unpaid = resolveEntitlements(baseAccount({ plan: "starter", subscriptionStatus: "unpaid" }));
  check("unpaid: not entitled", unpaid.isEntitled === false, "expected false");

  const canceled = resolveEntitlements(baseAccount({ plan: "starter", subscriptionStatus: "canceled" }));
  check("canceled: not entitled", canceled.isEntitled === false, "expected false");

  const incompleteExpired = resolveEntitlements(baseAccount({ plan: "starter", subscriptionStatus: "incomplete_expired" }));
  check("incomplete_expired: not entitled", incompleteExpired.isEntitled === false, "expected false");

  const cancelPending = resolveEntitlements(
    baseAccount({ plan: "growth", subscriptionStatus: "active", cancelAtPeriodEnd: true, currentPeriodEnd: new Date("2026-09-01T00:00:00Z") }),
  );
  check("cancel_at_period_end: still entitled until the period actually ends", cancelPending.isEntitled === true, "expected true");
  check("cancel_at_period_end: flag passed through for the UI to show a warning", cancelPending.cancelAtPeriodEnd === true, "expected true");

  const noPriorTrial = resolveEntitlements(baseAccount());
  check("hasEverTrialed: false when trialEndsAt has never been set", noPriorTrial.hasEverTrialed === false, "expected false");
  const priorTrial = resolveEntitlements(baseAccount({ subscriptionStatus: "canceled", trialEndsAt: new Date("2026-01-01T00:00:00Z") }));
  check(
    "hasEverTrialed: true once trialEndsAt has ever been set, even after the subscription later canceled",
    priorTrial.hasEverTrialed === true,
    "expected true — this is what prevents a second free trial via cancel+resubscribe",
  );

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main();
