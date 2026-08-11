import type { NormalizedConversation, RateLimitStatus, SearchParams, SourceAdapter, SourceHealth } from "./types";

/**
 * The Track A / validation-track source. It never polls anything — a human
 * pastes in a real public conversation (Section 19 of the plan: "manually
 * assembled validation dataset ... run through the actual production
 * analysis pipeline"). search() is a no-op to satisfy the interface;
 * normalizeManualSubmission is the real entry point, called directly from
 * the import action.
 */
export class ManualAdapter implements SourceAdapter {
  readonly type = "manual";

  async search(_params: SearchParams): Promise<NormalizedConversation[]> {
    return [];
  }

  async health(): Promise<SourceHealth> {
    return { configured: true, status: "ok", message: "Manual import is always available." };
  }

  async rateLimitStatus(): Promise<RateLimitStatus> {
    return { remaining: null, resetAt: null };
  }
}

export function normalizeManualSubmission(input: {
  originalText: string;
  url: string;
  title?: string;
  community?: string;
  authorRef?: string;
  postedAt?: Date;
}): NormalizedConversation {
  return {
    source: "manual",
    sourceId: null,
    authorRef: input.authorRef || null,
    title: input.title || null,
    originalText: input.originalText,
    url: input.url,
    community: input.community || null,
    postedAt: input.postedAt ?? new Date(),
  };
}
