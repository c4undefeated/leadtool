import type { NormalizedConversation, RateLimitStatus, SearchParams, SourceAdapter, SourceHealth } from "./types";
import * as redditapis from "@/lib/providers/redditapis/service";
import type { RedditapisPost } from "@/lib/providers/redditapis/service";
import { runDiscovery } from "./searchOrchestrator";

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
 *
 * Query strategy (broad discovery -> semantic qualification) lives in
 * ./searchOrchestrator.ts, not here — this adapter's job is just: ask the
 * orchestrator for discovered posts, apply the one thing that has to happen
 * per-post regardless of which query found it (the real recency cutoff),
 * and normalize into NormalizedConversation. See searchOrchestrator.ts for
 * the retrieval architecture itself.
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
    // /api/reddit/search takes at most one subreddit filter. To keep the
    // whole batch of queries this scan runs at a predictable, bounded cost,
    // we only pass a subreddit restriction when the campaign names exactly
    // one community; zero or multiple communities fall back to an unscoped
    // global search rather than looping per-subreddit.
    const subreddit = params.communities.length === 1 ? params.communities[0] : undefined;

    // Redditapis's own time-window param only takes coarse buckets (hour/
    // day/week/month/year/all) and — per its docs — mainly affects
    // top/controversial sort, not new/relevance. We use it as a cheap
    // superset hint to the provider (never narrower than what we actually
    // need), then enforce the real cutoff ourselves against each post's
    // real created_utc below. That's the only place true 12h/24h/48h
    // precision exists — Redditapis doesn't offer it, so we don't pretend
    // to pass it through.
    const maxAgeHours = params.maxAgeHours ?? 24;
    const t = maxAgeHours <= 24 ? "day" : maxAgeHours <= 168 ? "week" : maxAgeHours <= 720 ? "month" : "all";

    const discovery = await runDiscovery({
      campaignId: params.campaignId ?? "",
      companyId: params.companyId,
      keywords: params.keywords,
      topics: params.topics,
      subreddit,
      sort: "new",
      t,
      hasGeography: Boolean(params.geography && params.geography.trim()),
      baselineLimit: params.limit ?? 100,
      maxAgeHours,
      scanRunId: params.scanRunId,
    });

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const recent = discovery.posts.filter((d) => d.post.created_utc * 1000 >= cutoff);

    // Top-of-funnel visibility: how many queries ran, what each found raw,
    // and how many survived the real recency cutoff — so a "0 ingested"
    // result downstream can be told apart from "discovery found nothing"
    // vs. "it found things, they just weren't recent enough."
    const surfaceSummary = discovery.surfacesRun.map((s) => `${s.family}:${s.rawCount}`).join(", ");
    console.log(
      `[RedditApisSourceAdapter] campaign ${params.campaignId ?? "?"}: ran ${discovery.surfacesRun.length} quer${discovery.surfacesRun.length === 1 ? "y" : "ies"} (${surfaceSummary}) -> ${discovery.posts.length} unique post(s), ${recent.length} within the ${maxAgeHours}h window` +
        (discovery.errors.length > 0 ? ` (${discovery.errors.length} quer${discovery.errors.length === 1 ? "y" : "ies"} failed: ${discovery.errors.join("; ")})` : ""),
    );

    return recent.map((d) => normalizePost(d.post, d.foundBy));
  }
}

function normalizePost(post: RedditapisPost, foundBy: string[]): NormalizedConversation {
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
    foundBySurfaces: foundBy,
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
