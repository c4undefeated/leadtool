/**
 * Orchestration layer: cache check → budget check → client call → cost
 * ledger write → cache store. The adapter (lib/sources/redditApisAdapter.ts)
 * should only ever call functions from here, never lib/providers/redditapis/client.ts
 * directly — this is what guarantees every real call is budgeted and logged.
 */
import * as client from "./client";
import { ENDPOINT_UNIT_COST_USD } from "./client";
import { buildCacheKey, getCached, setCached } from "./cache";
import { checkBudget } from "./budget";
import { recordUsage } from "./costLedger";

export { getProviderHealth } from "./health";
export type { ProviderHealth, ProviderHealthStatus } from "./health";
export { RedditapisNotConfiguredError, RedditapisRequestError } from "./client";
export type { RedditapisPost } from "./client";

export class RedditapisBudgetExceededError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "RedditapisBudgetExceededError";
  }
}

type CallContext = { campaignId?: string; companyId?: string };

async function callBudgeted<T>(opts: {
  endpoint: string;
  requestType: client.RedditapisRequestType;
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
    if (!budget.allowed) throw new RedditapisBudgetExceededError(budget.reason);
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

export async function searchRedditapis(
  params: client.SearchPostsParams,
  context: CallContext = {},
): Promise<client.SearchPostsResponse> {
  return callBudgeted({
    endpoint: "GET /api/reddit/search",
    requestType: "search",
    cacheKey: buildCacheKey("search", params),
    context,
    run: () => client.searchPosts(params),
  });
}

export async function listSubredditPostsCached(
  params: client.ListPostsParams,
  context: CallContext = {},
): Promise<client.ListPostsResponse> {
  return callBudgeted({
    endpoint: "GET /api/reddit/posts",
    requestType: "posts",
    cacheKey: buildCacheKey("posts", params),
    context,
    run: () => client.listSubredditPosts(params),
  });
}
