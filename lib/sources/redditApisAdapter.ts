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
    const query = buildQuery(params.keywords, params.topics);
    if (!query) return [];

    const limit = Math.min(params.limit ?? 25, 100);
    // /api/reddit/search takes at most one subreddit filter. To guarantee
    // exactly one provider call per scan (cost-aware scheduling), we only
    // pass a subreddit restriction when the campaign names exactly one
    // community; zero or multiple communities fall back to an unscoped
    // global search rather than looping per-subreddit.
    const subreddit = params.communities.length === 1 ? params.communities[0] : undefined;
    // Always newest-first. This used to be "relevance" when unscoped, on
    // the theory that "newest across all of Reddit" for a common phrase
    // would get drowned out by unrelated high-traffic communities. Verified
    // live that the opposite is true in practice: an unscoped relevance
    // query returned a post from 2015, while an unscoped sort=new query
    // with the same style of terms returned 100 genuinely fresh posts
    // spanning dozens of subreddits (including small local ones) — exactly
    // the "across all subreddits" coverage this adapter is for.
    const sort = "new";

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

    // Top-of-funnel visibility: how much the provider actually returned
    // before our own recency cutoff trims it, so a "0 ingested" result
    // downstream can be told apart from "the provider itself found
    // nothing" vs. "it found things, they just weren't recent enough."
    console.log(
      `[RedditApisSourceAdapter] campaign ${params.campaignId ?? "?"}: query="${query}" subreddit=${subreddit ?? "(all)"} -> ${response.posts.length} raw post(s) from Redditapis, ${recentPosts.length} within the ${maxAgeHours}h window`,
    );

    return recentPosts.map(normalizePost);
  }
}

// Generic, vertical-agnostic buying-intent vocabulary. This is NOT derived
// from any campaign's configured keywords — it's a fixed list ANDed against
// a campaign's short topic terms to broaden search beyond requiring one of
// the campaign's exact, often long, keyword phrases to appear verbatim.
// Verified live against the real endpoint: a 20-phrase exact "OR" query
// (all of a real campaign's configured keywords, quoted) returned zero
// matches in a one-week window; a 4-topic-term query ANDed against a subset
// of these intent words, same window, returned 100 matches spanning dozens
// of subreddits. Long, specific sentences are rare in real posts; short
// nouns + common intent words are not.
const INTENT_WORDS = ["looking", "need", "recommend", "recommendation", "recommendations", "suggest", "suggestions", "advice", "hire", "considering", "want"];

// Length itself isn't the real constraint — a 609-character all-quoted
// query parsed and returned HTTP 200 in live testing — but a generous cap
// still guards against a pathological case (e.g. a campaign with dozens of
// keywords) producing something unpredictable.
const MAX_PHRASE_GROUP_LENGTH = 400;

function buildPhraseGroup(phrases: string[], maxLength: number): string {
  const parts: string[] = [];
  let length = 0;
  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    const quoted = `"${trimmed.replace(/"/g, "")}"`;
    const addition = (parts.length === 0 ? "" : " OR ") + quoted;
    if (length + addition.length > maxLength) break;
    parts.push(quoted);
    length += addition.length;
  }
  return parts.join(" OR ");
}

/**
 * Combines two independent query strategies into one call (still exactly
 * one Redditapis request per scan): a broad group — short campaign-defined
 * topic terms ANDed against a fixed intent-word list, for wide recall
 * across all of Reddit — and a precise group — the campaign's own full
 * keyword phrases, quoted and OR'd, for exact matches. Either group can be
 * empty (e.g. a campaign with no topic terms configured yet falls back to
 * exactly the precise-only behavior this adapter always had).
 */
function buildQuery(keywords: string[], topics: string[]): string {
  const topicGroup = buildPhraseGroup(topics, MAX_PHRASE_GROUP_LENGTH);
  const broad = topicGroup ? `(${topicGroup}) AND (${INTENT_WORDS.join(" OR ")})` : "";
  const precise = buildPhraseGroup(keywords, MAX_PHRASE_GROUP_LENGTH);

  if (broad && precise) return `(${broad}) OR (${precise})`;
  return broad || precise;
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
