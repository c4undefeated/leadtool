/**
 * Single source of truth for "is live Reddit ingestion actually available".
 * Gated purely on the presence of credentials — see README.md. Nothing in
 * the product should silently pretend Reddit is live when it isn't.
 */
export function isRedditConfigured(): boolean {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

export function defaultSourceType(): "reddit" | "manual" {
  return isRedditConfigured() ? "reddit" : "manual";
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
