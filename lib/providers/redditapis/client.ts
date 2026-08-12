/**
 * The ONE module that talks to Redditapis (api.redditapis.com) over HTTP.
 * Nothing else in the codebase should construct a Redditapis URL, read
 * REDDITAPIS_API_KEY, or parse a raw Redditapis response — everything else
 * goes through the functions exported here, or through service.ts, which
 * wraps these with budget/cache/ledger enforcement.
 *
 * Redditapis is a third-party data provider, not Reddit's official API and
 * not affiliated with Reddit. Its availability, data provenance, terms, and
 * continued access are an external dependency IntentScout monitors — see
 * health.ts — not something this codebase makes claims about.
 *
 * Only documented, READ-only endpoints are implemented here:
 *   GET /api/reddit/posts   — subreddit listing
 *   GET /api/reddit/search  — keyword search (global or subreddit-scoped)
 *   GET /account/me         — free account/balance check
 *
 * Permanently out of scope, regardless of future instructions short of an
 * explicit, specific revisit of this decision: /docs/auth/login (returns
 * live Reddit session cookies), /docs/write/*, /docs/dm/*, any vote
 * endpoint. IntentScout never authenticates as a Reddit user and never
 * posts, votes, or messages automatically.
 */

const BASE_URL = "https://api.redditapis.com";

export class RedditapisNotConfiguredError extends Error {
  constructor() {
    super("REDDITAPIS_API_KEY is not set — Redditapis ingestion is disabled.");
    this.name = "RedditapisNotConfiguredError";
  }
}

export class RedditapisRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RedditapisRequestError";
    this.status = status;
  }
}

/** Per-call documented pricing. `account` is free and does not consume credits. */
export const ENDPOINT_UNIT_COST_USD = {
  search: 0.002,
  posts: 0.002,
  account: 0,
} as const;

export type RedditapisRequestType = keyof typeof ENDPOINT_UNIT_COST_USD;

function getApiKey(): string {
  const key = process.env.REDDITAPIS_API_KEY;
  if (!key) throw new RedditapisNotConfiguredError();
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
    throw new RedditapisRequestError(0, err instanceof Error ? `Network error: ${err.message}` : "Network error.");
  }

  if (!res.ok) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }
    throw new RedditapisRequestError(res.status, `Redditapis ${path} failed: ${res.status} ${bodyText}`.trim());
  }

  return (await res.json()) as T;
}

export type RedditapisPost = {
  id: string;
  name: string;
  title?: string;
  author?: string;
  author_info?: { fullname?: string; premium?: boolean; is_blocked?: boolean; flair?: string };
  permalink?: string;
  url?: string;
  link_url?: string;
  text?: string;
  subreddit?: string;
  upvotes?: number;
  comments?: number;
  upvote_ratio?: number;
  over_18?: boolean;
  stickied?: boolean;
  locked?: boolean;
  spoiler?: boolean;
  is_self?: boolean;
  is_crosspost?: boolean;
  crosspost_origin?: string;
  created_utc: number;
  created?: string;
};

export type ListPostsParams = {
  subreddit: string;
  sort?: "new" | "hot" | "top" | "rising" | "controversial" | "best";
  t?: "hour" | "day" | "week" | "month" | "year" | "all";
  limit?: number;
  after?: string;
};

export type ListPostsResponse = { posts: RedditapisPost[]; after: string | null };

/** GET /api/reddit/posts — one subreddit's listing. $0.002/call. */
export async function listSubredditPosts(params: ListPostsParams): Promise<ListPostsResponse> {
  return get<ListPostsResponse>("/api/reddit/posts", {
    subreddit: params.subreddit,
    sort: params.sort ?? "new",
    t: params.t,
    limit: params.limit ?? 25,
    after: params.after,
  });
}

export type SearchPostsParams = {
  q: string;
  subreddit?: string;
  sort?: "relevance" | "new" | "hot" | "top" | "comments";
  t?: "hour" | "day" | "week" | "month" | "year" | "all";
  limit?: number;
  after?: string;
};

export type SearchPostsResponse = {
  posts: RedditapisPost[];
  after: string | null;
  meta?: { fetched: number; returned: number; filtered_out: number; filters: Record<string, unknown> };
};

/** GET /api/reddit/search — global or subreddit-scoped keyword search. $0.002/call. */
export async function searchPosts(params: SearchPostsParams): Promise<SearchPostsResponse> {
  return get<SearchPostsResponse>("/api/reddit/search", {
    q: params.q,
    subreddit: params.subreddit,
    sort: params.sort ?? "new",
    t: params.t,
    limit: params.limit ?? 25,
    after: params.after,
  });
}

export type RedditapisAccount = {
  email: string;
  name: string;
  credits_remaining: number;
  credits_used: number;
  total_requests: number;
  created_at: string;
};

/** GET /account/me — free, does not consume credits. */
export async function getAccount(): Promise<RedditapisAccount> {
  return get<RedditapisAccount>("/account/me", {});
}
