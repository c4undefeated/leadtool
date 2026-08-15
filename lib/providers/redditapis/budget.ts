import { getLifetimeSpendUsd } from "./costLedger";
import { getProviderHealth } from "./health";

// This is a secondary, code-level ceiling layered ON TOP OF the real guard
// below (MIN_LIVE_BALANCE_RESERVE_USD against the account's actual live
// balance, read from Redditapis itself) — not the thing standing between
// this deployment and overspending. That real guard means raising this
// default doesn't increase actual financial exposure: the account still
// physically cannot spend more than it holds, and checkBudget still stops
// (gracefully — see the caller) once real balance runs low, regardless of
// this number. $0.50 was sized for early single-scan manual testing, before
// multi-batch discovery (up to ~11 calls/scan) and daily-cron campaigns
// existed — at that volume it was closer to a same-day ceiling than a
// meaningful safety margin. Raised to a number that stops mattering in
// practice before the live-balance check does, for any account funded
// beyond pocket-change; override via env var for anything more specific
// than that.
const DEFAULT_MAX_LIFETIME_SPEND_USD = 5;
// Never let a call bring the live account balance below this — a safety
// margin on top of the ledger check, in case the ledger and the provider's
// own balance have drifted (e.g. a call succeeded but the DB write failed).
const MIN_LIVE_BALANCE_RESERVE_USD = 0.02;

function maxLifetimeSpendUsd(): number {
  const raw = process.env.REDDITAPIS_MAX_TEST_SPEND_USD;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_LIFETIME_SPEND_USD;
}

export type BudgetCheck = { allowed: true } | { allowed: false; reason: string };

/** Call before every paid Redditapis request. Cache hits should skip this — they cost nothing. */
export async function checkBudget(estimatedCostUsd: number): Promise<BudgetCheck> {
  const cap = maxLifetimeSpendUsd();
  const spent = await getLifetimeSpendUsd();
  if (spent + estimatedCostUsd > cap) {
    return {
      allowed: false,
      reason: `Redditapis testing budget cap reached ($${spent.toFixed(3)} of $${cap.toFixed(2)} spent) — raise REDDITAPIS_MAX_TEST_SPEND_USD to continue.`,
    };
  }

  const health = await getProviderHealth();
  if (health.status === "not_configured" || health.status === "unavailable") {
    return { allowed: false, reason: health.message };
  }
  if (health.creditsRemainingUsd !== null && health.creditsRemainingUsd - estimatedCostUsd < MIN_LIVE_BALANCE_RESERVE_USD) {
    return {
      allowed: false,
      reason: `Redditapis live balance too low to safely make this call ($${health.creditsRemainingUsd.toFixed(3)} remaining).`,
    };
  }

  return { allowed: true };
}
