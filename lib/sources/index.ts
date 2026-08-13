import type { SourceAdapter } from "./types";
import { ManualAdapter } from "./manualAdapter";
import { RedditApisSourceAdapter } from "./redditApisAdapter";
import { TwitterApisSourceAdapter } from "./twitterApisAdapter";

const adapters: Record<string, SourceAdapter> = {
  manual: new ManualAdapter(),
  reddit: new RedditApisSourceAdapter(),
  twitter: new TwitterApisSourceAdapter(),
};

export function getAdapter(type: string): SourceAdapter {
  const adapter = adapters[type];
  if (!adapter) throw new Error(`No SourceAdapter registered for "${type}".`);
  return adapter;
}

export { adapters };
export type { SourceAdapter } from "./types";
export type { NormalizedConversation, SearchParams, SourceHealth, RateLimitStatus } from "./types";
