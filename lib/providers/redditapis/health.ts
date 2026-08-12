import { getAccount, RedditapisNotConfiguredError, RedditapisRequestError } from "./client";

export type ProviderHealthStatus = "healthy" | "warning" | "critical" | "unavailable" | "not_configured";

export type ProviderHealth = {
  status: ProviderHealthStatus;
  message: string;
  creditsRemainingUsd: number | null;
  checkedAt: Date;
};

// Thresholds sized around the ~$0.55 initial testing balance — a handful of
// $0.002 calls' worth of headroom, not a real production margin policy.
const CRITICAL_BELOW_USD = 0.05;
const WARNING_BELOW_USD = 0.25;

// /account/me is free, but there's no reason to hit it on every single
// request — checked at most this often and reused in between.
const HEALTH_CACHE_TTL_MS = 2 * 60 * 1000;

let cached: { health: ProviderHealth; fetchedAt: number } | null = null;

export async function getProviderHealth(force = false): Promise<ProviderHealth> {
  if (!force && cached && Date.now() - cached.fetchedAt < HEALTH_CACHE_TTL_MS) {
    return cached.health;
  }

  let health: ProviderHealth;
  try {
    const account = await getAccount();
    const remaining = account.credits_remaining;
    let status: ProviderHealthStatus = "healthy";
    let message = `Redditapis balance: $${remaining.toFixed(2)}.`;
    if (remaining < CRITICAL_BELOW_USD) {
      status = "critical";
      message = `Redditapis balance is critically low ($${remaining.toFixed(2)}) — ingestion is paused to avoid an unexpected failed charge.`;
    } else if (remaining < WARNING_BELOW_USD) {
      status = "warning";
      message = `Redditapis balance is low ($${remaining.toFixed(2)}) — consider topping up soon.`;
    }
    health = { status, message, creditsRemainingUsd: remaining, checkedAt: new Date() };
  } catch (err) {
    if (err instanceof RedditapisNotConfiguredError) {
      health = {
        status: "not_configured",
        message: "REDDITAPIS_API_KEY not set — Reddit ingestion is disabled. Use manual import instead.",
        creditsRemainingUsd: null,
        checkedAt: new Date(),
      };
    } else {
      const message = err instanceof RedditapisRequestError ? err.message : "Redditapis is unreachable.";
      health = { status: "unavailable", message, creditsRemainingUsd: null, checkedAt: new Date() };
    }
  }

  cached = { health, fetchedAt: Date.now() };
  return health;
}
