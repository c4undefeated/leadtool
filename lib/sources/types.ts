/**
 * The contract every data source must satisfy. Nothing outside lib/sources/*
 * may import a source-specific type or field — analysis, opportunities, and
 * the UI only ever see NormalizedConversation. This is what lets a second
 * source (X, LinkedIn, a forum) plug in later without touching anything
 * downstream of ingestion.
 */

export type NormalizedConversation = {
  source: string; // adapter.type — "reddit" | "manual" | future sources
  sourceId: string | null; // external id for dedup; null when not applicable (e.g. manual)
  authorRef: string | null;
  title: string | null;
  originalText: string;
  url: string;
  community: string | null; // subreddit, forum section, etc — generic label
  postedAt: Date;
  /** Opaque, source-specific extras. Analysis and UI code must never read this. */
  metadata?: Record<string, unknown>;
  /** SearchSurface ids (or "baseline") whose query returned this post — first-class, not opaque metadata, because pipeline.ts reads it back to credit opportunities to the surfaces that found them. Adapters without a notion of query surfaces leave this unset. */
  foundBySurfaces?: string[];
};

export type SourceHealth = {
  configured: boolean;
  status: "ok" | "not_configured" | "error";
  message: string;
};

export type RateLimitStatus = {
  remaining: number | null;
  resetAt: Date | null;
};

export type SearchParams = {
  keywords: string[];
  /** Short, broad topic nouns (e.g. "personal trainer") — optional. Adapters that support boolean queries AND these against a fixed intent-word list to widen recall beyond exact keyword phrases; adapters without that notion ignore this. */
  topics: string[];
  communities: string[]; // e.g. subreddit names; adapter interprets meaning
  limit?: number;
  /** Only surface results posted within this many hours. Adapters without a real notion of "posted at" ignore this. */
  maxAgeHours?: number;
  /** Optional attribution for adapters that meter/bill calls (e.g. cost ledger). Adapters that don't meter usage ignore these. */
  campaignId?: string;
  companyId?: string;
  /** The business's real geography constraint, if any — null/undefined means remote/anywhere. Adapters that support location-aware retrieval use this to decide whether local search angles are a real signal or a guess; adapters without that notion ignore it. */
  geography?: string | null;
};

export interface SourceAdapter {
  readonly type: string;
  search(params: SearchParams): Promise<NormalizedConversation[]>;
  health(): Promise<SourceHealth>;
  rateLimitStatus(): Promise<RateLimitStatus>;
}
