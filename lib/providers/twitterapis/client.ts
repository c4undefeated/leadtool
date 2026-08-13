/**
 * The ONE module that talks to TwitterAPIs (api.twitterapis.com) over HTTP.
 * Nothing else in the codebase should construct a TwitterAPIs URL, read
 * TWITTER_API_KEY, or parse a raw TwitterAPIs response — everything else
 * goes through the functions exported here, or through service.ts, which
 * wraps these with budget/cache/ledger enforcement. Mirrors
 * lib/providers/redditapis/client.ts exactly, by design — same vendor
 * template, same governance.
 *
 * TwitterAPIs is a third-party data provider, not X/Twitter's official API
 * and not affiliated with X. Its availability, data provenance, terms, and
 * continued access are an external dependency IntentScout monitors — see
 * health.ts — not something this codebase makes claims about.
 *
 * Only documented, READ-only, app-level endpoints are implemented here:
 *   GET /twitter/tweet/advanced_search — tweet search
 *   GET /account/me                    — free account/balance check
 *
 * Permanently out of scope, regardless of future instructions short of an
 * explicit, specific revisit of this decision: "Register Session" / "User
 * Login" (logs into a real X account with a username/password and stores
 * session cookies for authenticated actions — the same credential-
 * automation red flag as Redditapis's /login), every write endpoint
 * (create/delete tweet, like, retweet, bookmark, follow), and DM
 * inbox/conversation/send — all of which are documented as requiring that
 * same registered session. IntentScout never authenticates as an X user
 * and never posts, likes, retweets, follows, or messages automatically.
 */

const BASE_URL = "https://api.twitterapis.com";

export class TwitterApisNotConfiguredError extends Error {
  constructor() {
    super("TWITTER_API_KEY is not set — TwitterAPIs ingestion is disabled.");
    this.name = "TwitterApisNotConfiguredError";
  }
}

export class TwitterApisRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TwitterApisRequestError";
    this.status = status;
  }
}

/** Per-call documented pricing. `account` is free and does not consume credits. */
export const ENDPOINT_UNIT_COST_USD = {
  search: 0.0008,
  account: 0,
} as const;

export type TwitterApisRequestType = keyof typeof ENDPOINT_UNIT_COST_USD;

function getApiKey(): string {
  const key = process.env.TWITTER_API_KEY;
  if (!key) throw new TwitterApisNotConfiguredError();
  return key;
}

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    // Never include the Authorization header or apiKey value in any thrown message.
    throw new TwitterApisRequestError(0, err instanceof Error ? `Network error: ${err.message}` : "Network error.");
  }

  if (!res.ok) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }
    throw new TwitterApisRequestError(res.status, `TwitterAPIs ${path} failed: ${res.status} ${bodyText}`.trim());
  }

  return (await res.json()) as T;
}

export type Tweet = {
  id: string;
  text: string;
  created_at: string;
  author: { id: string; username: string; name: string };
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  view_count?: number;
};

export type SearchTweetsParams = {
  query: string;
  product?: "Latest" | "Top" | "People" | "Photos" | "Videos";
  cursor?: string;
};

export type SearchTweetsResponse = {
  query: string;
  product: string;
  count: number;
  next_cursor: string | null;
  tweets: Tweet[];
};

/** GET /twitter/tweet/advanced_search — full-text tweet search, ~20 results/page, not honoring a custom count. $0.0008/call. */
export async function searchTweets(params: SearchTweetsParams): Promise<SearchTweetsResponse> {
  return get<SearchTweetsResponse>("/twitter/tweet/advanced_search", {
    query: params.query,
    product: params.product ?? "Latest",
    cursor: params.cursor,
  });
}

export type TwitterApisAccount = {
  email: string;
  name: string;
  credits_remaining: number;
  credits_used: number;
  total_requests: number;
  created_at: string;
};

/** GET /account/me — free, does not consume credits. */
export async function getAccount(): Promise<TwitterApisAccount> {
  return get<TwitterApisAccount>("/account/me", {});
}
