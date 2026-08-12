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
    const query = params.keywords.join(" OR ");
    if (!query) return [];

    const limit = Math.min(params.limit ?? 25, 100);
    // /api/reddit/search takes at most one subreddit filter. To guarantee
    // exactly one provider call per scan (cost-aware scheduling), we only
    // pass a subreddit restriction when the campaign names exactly one
    // community; zero or multiple communities fall back to an unscoped
    // global search rather than looping per-subreddit.
    const subreddit = params.communities.length === 1 ? params.communities[0] : undefined;

    const context = { campaignId: params.campaignId, companyId: params.companyId };
    const response = await redditapis.searchRedditapis({ q: query, subreddit, sort: "new", limit }, context);

    return response.posts.map(normalizePost);
  }
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
