import type { NormalizedConversation, RateLimitStatus, SearchParams, SourceAdapter, SourceHealth } from "./types";

/**
 * Reddit is SourceAdapter #1. This is a real implementation of Reddit's
 * app-only OAuth (client_credentials grant) against a "script" app — the
 * flow that lets IntentScout read public data server-side without any
 * customer ever creating their own Reddit developer app or logging into
 * Reddit (see the implementation plan's Reddit validation section).
 *
 * It is inert without REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET, and those
 * alone are not sufficient for production use: as of 2026, Reddit requires
 * every developer — including this one — to get pre-approval under its
 * Responsible Builder Policy, and separately requires explicit written
 * approval (typically a contract) for any commercial use, before this
 * adapter may be pointed at real traffic. Do not enable this in production
 * until that approval exists. See README.md.
 */

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";

type Token = { accessToken: string; expiresAt: number };
let cachedToken: Token | null = null;
let cachedRateLimit: RateLimitStatus = { remaining: null, resetAt: null };

function credentials() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT || "IntentScout/0.1";
  return { clientId, clientSecret, userAgent };
}

async function getAppToken(): Promise<string> {
  const { clientId, clientSecret, userAgent } = credentials();
  if (!clientId || !clientSecret) {
    throw new Error("Reddit is not configured (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET missing).");
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 10_000) {
    return cachedToken.accessToken;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Reddit token request failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.accessToken;
}

function recordRateLimit(res: Response) {
  const remaining = res.headers.get("x-ratelimit-remaining");
  const resetSeconds = res.headers.get("x-ratelimit-reset");
  cachedRateLimit = {
    remaining: remaining ? Math.floor(Number(remaining)) : null,
    resetAt: resetSeconds ? new Date(Date.now() + Number(resetSeconds) * 1000) : null,
  };
}

type RedditListingChild = {
  data: {
    id: string;
    name: string;
    title?: string;
    selftext?: string;
    body?: string;
    author?: string;
    subreddit?: string;
    permalink?: string;
    created_utc: number;
    is_self?: boolean;
  };
};

function normalizeChild(child: RedditListingChild): NormalizedConversation {
  const d = child.data;
  const text = d.selftext || d.body || d.title || "";
  return {
    source: "reddit",
    sourceId: d.name || d.id,
    authorRef: d.author ? `u/${d.author}` : null,
    title: d.title ?? null,
    originalText: text,
    url: d.permalink ? `https://www.reddit.com${d.permalink}` : "https://www.reddit.com",
    community: d.subreddit ? `r/${d.subreddit}` : null,
    postedAt: new Date(d.created_utc * 1000),
    metadata: { redditId: d.id, redditName: d.name },
  };
}

export class RedditAdapter implements SourceAdapter {
  readonly type = "reddit";

  async health(): Promise<SourceHealth> {
    const { clientId, clientSecret } = credentials();
    if (!clientId || !clientSecret) {
      return {
        configured: false,
        status: "not_configured",
        message:
          "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set. Reddit ingestion is disabled — use manual import instead.",
      };
    }
    try {
      await getAppToken();
      return { configured: true, status: "ok", message: "Reddit app-only auth is working." };
    } catch (err) {
      return {
        configured: true,
        status: "error",
        message: err instanceof Error ? err.message : "Unknown Reddit auth error.",
      };
    }
  }

  async rateLimitStatus(): Promise<RateLimitStatus> {
    return cachedRateLimit;
  }

  async search(params: SearchParams): Promise<NormalizedConversation[]> {
    const { userAgent } = credentials();
    const token = await getAppToken();
    const limit = Math.min(params.limit ?? 25, 100);
    const query = params.keywords.join(" OR ");
    if (!query) return [];

    const results: NormalizedConversation[] = [];
    const communities = params.communities.length > 0 ? params.communities : [null];

    for (const community of communities) {
      const path = community
        ? `/r/${encodeURIComponent(community)}/search`
        : "/search";
      const url = new URL(API_BASE + path);
      url.searchParams.set("q", query);
      url.searchParams.set("sort", "new");
      url.searchParams.set("limit", String(limit));
      if (community) url.searchParams.set("restrict_sr", "1");

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": userAgent,
        },
      });
      recordRateLimit(res);

      if (!res.ok) {
        throw new Error(`Reddit search failed for ${community ?? "(all)"}: ${res.status}`);
      }

      const json = (await res.json()) as { data: { children: RedditListingChild[] } };
      for (const child of json.data.children) {
        results.push(normalizeChild(child));
      }
    }

    return results;
  }
}
