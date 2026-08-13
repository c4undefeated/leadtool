import type { NormalizedConversation, RateLimitStatus, SearchParams, SourceAdapter, SourceHealth } from "./types";
import * as redditapis from "@/lib/providers/redditapis/service";
import type { RedditapisPost } from "@/lib/providers/redditapis/service";

/**
 * Reddit is SourceAdapter #1, backed by Redditapis (api.redditapis.com) — a
 * third-party data provider, NOT Reddit's official API and not affiliated
 * with Reddit. Its availability, data provenance, terms, and continued
 * access are an external dependency IntentScout monitors (see
 * lib/providers/redditapis/health.ts), not something this codebase asserts
 * or vouches for.
 *
 * READ-ONLY, permanently: this adapter only calls documented GET endpoints
 * (search, subreddit listing, free account check). It never authenticates
 * as a Reddit user and never calls a write, vote, DM, or login endpoint —
 * see lib/providers/redditapis/client.ts for the full boundary. Nothing in
 * IntentScout posts, votes, or messages automatically; every draft this
 * product produces is copy/pasted and sent by a human.
 *
 * All provider calls are budgeted, cost-logged, and short-TTL cached
 * through lib/providers/redditapis/service.ts — this file never talks to
 * Redditapis directly.
 */
export class RedditApisSourceAdapter implements SourceAdapter {
  readonly type = "reddit";

  async health(): Promise<SourceHealth> {
    const health = await redditapis.getProviderHealth();
    if (health.status === "not_configured") {
      return { configured: false, status: "not_configured", message: health.message };
    }
    if (health.status === "healthy" || health.status === "warning") {
      return { configured: true, status: "ok", message: health.message };
    }
    return { configured: true, status: "error", message: health.message };
  }

  async rateLimitStatus(): Promise<RateLimitStatus> {
    // Redditapis documents a per-minute rate limit only for the free
    // /account/me endpoint, not for /posts or /search — no header-based
    // remaining/reset to report here without inventing one.
    return { remaining: null, resetAt: null };
  }

  async search(params: SearchParams): Promise<NormalizedConversation[]> {
    const query = buildQuery(params.keywords);
    if (!query) return [];

    const limit = Math.min(params.limit ?? 25, 100);
    // /api/reddit/search takes at most one subreddit filter. To guarantee
    // exactly one provider call per scan (cost-aware scheduling), we only
    // pass a subreddit restriction when the campaign names exactly one
    // community; zero or multiple communities fall back to an unscoped
    // global search rather than looping per-subreddit.
    const subreddit = params.communities.length === 1 ? params.communities[0] : undefined;
    // Scoped to one community: sort by newest, like watching a live feed of
    // a place you already know is relevant. Unscoped (global) search sorts
    // by Reddit's own relevance ranking instead — "newest across all of
    // Reddit" for a common phrase just surfaces whatever unrelated
    // high-traffic community used those words most recently, drowning out
    // a smaller target audience entirely.
    const sort = subreddit ? "new" : "relevance";

    // Redditapis's own time-window param only takes coarse buckets (hour/
    // day/week/month/year/all) and — per its docs — mainly affects
    // top/controversial sort, not new/relevance. We use it as a cheap
    // superset hint to the provider (never narrower than what we actually
    // need), then enforce the real cutoff ourselves against each post's
    // real created_utc below. That's the only place true 12h/24h/48h
    // precision exists — Redditapis doesn't offer it, so we don't pretend
    // to pass it through.
    const maxAgeHours = params.maxAgeHours ?? 24;
    const t = maxAgeHours <= 24 ? "day" : maxAgeHours <= 168 ? "week" : "month";

    const context = { campaignId: params.campaignId, companyId: params.companyId };
    const response = await redditapis.searchRedditapis({ q: query, subreddit, sort, t, limit }, context);

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const recentPosts = response.posts.filter((post) => post.created_utc * 1000 >= cutoff);

    return recentPosts.map(normalizePost);
  }
}

// Every production query we've sent with 15+ unquoted keyword phrases
// joined by " OR " has come back with a literal empty `{"posts":[]}` from
// Redditapis, including subreddit-scoped sort=new searches against very
// active communities (r/fitness, r/personaltraining) where an empty
// result isn't plausible if the query were actually being parsed as a
// boolean OR of phrases. A shorter, unquoted query did return a real
// match once. Two changes address the likely cause: quoting each phrase
// (the standard way to ask a search backend to match it as one unit
// instead of ANDing/literalizing the raw words), and capping total query
// length so a long keyword list can't silently produce something the
// provider can't parse. This has not been verified against a live call
// from this environment — it's a diagnosis from stored request/response
// pairs, not a confirmed fix; watch the next real scan's ingested count.
const MAX_QUERY_LENGTH = 256;

function buildQuery(keywords: string[]): string {
  const parts: string[] = [];
  let length = 0;
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    const phrase = `"${trimmed.replace(/"/g, "")}"`;
    const addition = (parts.length === 0 ? "" : " OR ") + phrase;
    if (length + addition.length > MAX_QUERY_LENGTH) break;
    parts.push(phrase);
    length += addition.length;
  }
  return parts.join(" OR ");
}

function normalizePost(post: RedditapisPost): NormalizedConversation {
  const permalink = post.permalink
    ? post.permalink.startsWith("http")
      ? post.permalink
      : `https://www.reddit.com${post.permalink}`
    : (post.url ?? "https://www.reddit.com");

  return {
    source: "reddit",
    sourceId: post.name || post.id,
    authorRef: post.author ? `u/${post.author}` : null,
    title: post.title ?? null,
    originalText: post.text || post.title || "",
    url: permalink,
    community: post.subreddit ? `r/${post.subreddit}` : null,
    postedAt: new Date(post.created_utc * 1000),
    metadata: {
      redditapisId: post.id,
      redditapisName: post.name,
      upvotes: post.upvotes,
      comments: post.comments,
      upvoteRatio: post.upvote_ratio,
      over18: post.over_18,
      isSelf: post.is_self,
    },
  };
}
