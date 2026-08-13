import type { NormalizedConversation, RateLimitStatus, SearchParams, SourceAdapter, SourceHealth } from "./types";
import * as twitterapis from "@/lib/providers/twitterapis/service";
import type { Tweet } from "@/lib/providers/twitterapis/service";

/**
 * X/Twitter, backed by TwitterAPIs (api.twitterapis.com) — a third-party
 * data provider, NOT X's official API and not affiliated with X. Its
 * availability, data provenance, terms, and continued access are an
 * external dependency IntentScout monitors (see
 * lib/providers/twitterapis/health.ts), not something this codebase
 * asserts or vouches for. Mirrors lib/sources/redditApisAdapter.ts by
 * design — same governance, same shape, different provider.
 *
 * READ-ONLY, permanently: this adapter only calls the documented GET
 * search endpoint and the free account check. It never registers an X
 * session, never authenticates as an X user, and never calls a write,
 * like, retweet, follow, or DM endpoint — see
 * lib/providers/twitterapis/client.ts for the full boundary. Nothing in
 * IntentScout posts, likes, retweets, follows, or messages automatically;
 * every draft this product produces is copy/pasted and sent by a human.
 *
 * All provider calls are budgeted, cost-logged, and short-TTL cached
 * through lib/providers/twitterapis/service.ts — this file never talks to
 * TwitterAPIs directly.
 */
export class TwitterApisSourceAdapter implements SourceAdapter {
  readonly type = "twitter";

  async health(): Promise<SourceHealth> {
    const health = await twitterapis.getProviderHealth();
    if (health.status === "not_configured") {
      return { configured: false, status: "not_configured", message: health.message };
    }
    if (health.status === "healthy" || health.status === "warning") {
      return { configured: true, status: "ok", message: health.message };
    }
    return { configured: true, status: "error", message: health.message };
  }

  async rateLimitStatus(): Promise<RateLimitStatus> {
    // TwitterAPIs documents no platform rate-limit tiers and no
    // remaining/reset response headers — spend is "the only real
    // ceiling," per its own docs. Nothing honest to report here.
    return { remaining: null, resetAt: null };
  }

  async search(params: SearchParams): Promise<NormalizedConversation[]> {
    const query = params.keywords.join(" OR ");
    if (!query) return [];

    // Unlike Reddit, advanced_search has no documented "scope to a
    // community" operator — X doesn't have a subreddit-equivalent among
    // the documented query operators (from:/to:/since:/until:/min_faves:/
    // lang:). So campaign "communities" simply don't apply here; nothing
    // is silently dropped, there's just no real analog to map them to.
    const context = { campaignId: params.campaignId, companyId: params.companyId };
    const response = await twitterapis.searchTweets({ query, product: "Latest" }, context);

    const maxAgeHours = params.maxAgeHours ?? 24;
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const recentTweets = response.tweets.filter((tweet) => {
      const postedMs = Date.parse(tweet.created_at);
      // An unparseable timestamp is excluded rather than assumed-fresh —
      // never fabricate recency for something we couldn't actually verify.
      return !Number.isNaN(postedMs) && postedMs >= cutoff;
    });

    return recentTweets.map(normalizeTweet);
  }
}

function normalizeTweet(tweet: Tweet): NormalizedConversation {
  return {
    source: "twitter",
    sourceId: tweet.id,
    authorRef: tweet.author.username ? `@${tweet.author.username}` : null,
    title: null,
    originalText: tweet.text,
    url: `https://x.com/${tweet.author.username}/status/${tweet.id}`,
    community: null,
    postedAt: new Date(Date.parse(tweet.created_at)),
    metadata: {
      twitterId: tweet.id,
      authorName: tweet.author.name,
      favoriteCount: tweet.favorite_count,
      retweetCount: tweet.retweet_count,
      replyCount: tweet.reply_count,
      quoteCount: tweet.quote_count,
      bookmarkCount: tweet.bookmark_count,
      viewCount: tweet.view_count,
    },
  };
}
