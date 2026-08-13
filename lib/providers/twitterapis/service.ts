/**
 * Orchestration layer: cache check → budget check → client call → cost
 * ledger write → cache store. The adapter (lib/sources/twitterApisAdapter.ts)
 * should only ever call functions from here, never lib/providers/twitterapis/client.ts
 * directly — this is what guarantees every real call is budgeted and logged.
 * Mirrors lib/providers/redditapis/service.ts exactly.
 */
import * as client from "./client";
import { ENDPOINT_UNIT_COST_USD } from "./client";
import { buildCacheKey, getCached, setCached } from "./cache";
import { checkBudget } from "./budget";
import { recordUsage } from "./costLedger";

export { getProviderHealth } from "./health";
export type { ProviderHealth, ProviderHealthStatus } from "./health";
export { TwitterApisNotConfiguredError, TwitterApisRequestError } from "./client";
export type { Tweet } from "./client";

export class TwitterApisBudgetExceededError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "TwitterApisBudgetExceededError";
  }
}

type CallContext = { campaignId?: string; companyId?: string };

async function callBudgeted<T>(opts: {
  endpoint: string;
  requestType: client.TwitterApisRequestType;
  cacheKey: string;
  context: CallContext;
  run: () => Promise<T>;
}): Promise<T> {
  const cached = await getCached<T>(opts.cacheKey);
  if (cached) {
    await recordUsage({
      endpoint: opts.endpoint,
      requestType: opts.requestType,
      campaignId: opts.context.campaignId,
      companyId: opts.context.companyId,
      unitCostUsd: 0,
      cacheHit: true,
      success: true,
    });
    return cached;
  }

  const unitCost = ENDPOINT_UNIT_COST_USD[opts.requestType];
  if (unitCost > 0) {
    const budget = await checkBudget(unitCost);
    if (!budget.allowed) throw new TwitterApisBudgetExceededError(budget.reason);
  }

  try {
    const result = await opts.run();
    await recordUsage({
      endpoint: opts.endpoint,
      requestType: opts.requestType,
      campaignId: opts.context.campaignId,
      companyId: opts.context.companyId,
      unitCostUsd: unitCost,
      success: true,
    });
    await setCached(opts.cacheKey, result);
    return result;
  } catch (err) {
    await recordUsage({
      endpoint: opts.endpoint,
      requestType: opts.requestType,
      campaignId: opts.context.campaignId,
      companyId: opts.context.companyId,
      unitCostUsd: unitCost,
      success: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error.",
    });
    throw err;
  }
}

export async function searchTweets(
  params: client.SearchTweetsParams,
  context: CallContext = {},
): Promise<client.SearchTweetsResponse> {
  return callBudgeted({
    endpoint: "GET /twitter/tweet/advanced_search",
    requestType: "search",
    cacheKey: buildCacheKey("search", params),
    context,
    run: () => client.searchTweets(params),
  });
}
