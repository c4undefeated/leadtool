/**
 * Single source of truth for "is live Reddit ingestion actually available".
 * Gated purely on the presence of REDDITAPIS_API_KEY — see README.md.
 * Nothing in the product should silently pretend Reddit is live when it isn't.
 */
export function isRedditConfigured(): boolean {
  return Boolean(process.env.REDDITAPIS_API_KEY);
}

export function defaultSourceType(): "reddit" | "manual" {
  return isRedditConfigured() ? "reddit" : "manual";
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
