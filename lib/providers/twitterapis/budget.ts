import { getLifetimeSpendUsd } from "./costLedger";
import { getProviderHealth } from "./health";

// New TwitterAPIs accounts start with ~$0.50 of free credit. This cap
// exists so a bug or an accidental loop can't quietly burn through it —
// it is a testing-phase guard, not a real commercial budget system, and is
// meant to be raised deliberately (env var) once there's a real plan/limit
// to enforce instead.
const DEFAULT_MAX_LIFETIME_SPEND_USD = 0.5;
// Never let a call bring the live account balance below this — a safety
// margin on top of the ledger check, in case the ledger and the provider's
// own balance have drifted (e.g. a call succeeded but the DB write failed).
const MIN_LIVE_BALANCE_RESERVE_USD = 0.02;

function maxLifetimeSpendUsd(): number {
  const raw = process.env.TWITTER_MAX_TEST_SPEND_USD;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_LIFETIME_SPEND_USD;
}

export type BudgetCheck = { allowed: true } | { allowed: false; reason: string };

/** Call before every paid TwitterAPIs request. Cache hits should skip this — they cost nothing. */
export async function checkBudget(estimatedCostUsd: number): Promise<BudgetCheck> {
  const cap = maxLifetimeSpendUsd();
  const spent = await getLifetimeSpendUsd();
  if (spent + estimatedCostUsd > cap) {
    return {
      allowed: false,
      reason: `TwitterAPIs testing budget cap reached ($${spent.toFixed(3)} of $${cap.toFixed(2)} spent) — raise TWITTER_MAX_TEST_SPEND_USD to continue.`,
    };
  }

  const health = await getProviderHealth();
  if (health.status === "not_configured" || health.status === "unavailable") {
    return { allowed: false, reason: health.message };
  }
  if (health.creditsRemainingUsd !== null && health.creditsRemainingUsd - estimatedCostUsd < MIN_LIVE_BALANCE_RESERVE_USD) {
    return {
      allowed: false,
      reason: `TwitterAPIs live balance too low to safely make this call ($${health.creditsRemainingUsd.toFixed(3)} remaining).`,
    };
  }

  return { allowed: true };
}
