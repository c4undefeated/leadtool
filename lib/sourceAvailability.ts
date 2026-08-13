/**
 * Single source of truth for "is live Reddit ingestion actually available".
 * Gated purely on the presence of REDDITAPIS_API_KEY — see README.md.
 * Nothing in the product should silently pretend Reddit is live when it isn't.
 */
export function isRedditConfigured(): boolean {
  return Boolean(process.env.REDDITAPIS_API_KEY);
}

/** Same idea as isRedditConfigured, for TWITTER_API_KEY / TwitterAPIs. */
export function isTwitterConfigured(): boolean {
  return Boolean(process.env.TWITTER_API_KEY);
}

// Reddit was the first live source, so it wins if both happen to be
// configured — preserves existing campaigns' behavior exactly. A new
// campaign that specifically wants Twitter picks it explicitly at creation
// (see NewCampaignForm); this default only covers the "just pick something
// reasonable" case.
export function defaultSourceType(): "reddit" | "twitter" | "manual" {
  if (isRedditConfigured()) return "reddit";
  if (isTwitterConfigured()) return "twitter";
  return "manual";
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
