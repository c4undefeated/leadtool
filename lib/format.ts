export function parseReasoning(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

export const SAFETY_LABELS: Record<string, { text: string; className: string }> = {
  safe: { text: "Safe to engage", className: "pill-good" },
  caution: { text: "Caution", className: "pill-caution" },
  not_safe: { text: "Not safe", className: "pill-risk" },
};

export const ACTION_LABELS: Record<string, string> = {
  comment: "Public comment",
  dm: "Direct message",
  monitor: "Monitor / wait",
  none: "Don't engage",
};

export const INTENT_CATEGORY_LABELS: Record<string, string> = {
  tool_request: "Tool request",
  alternative_search: "Alternative search",
  comparison: "Comparison",
  hiring_outsourcing: "Hiring / outsourcing",
  troubleshooting: "Troubleshooting",
  pain_frustration: "Pain / frustration",
  exploring_solutions: "Exploring solutions",
  other: "Other",
};

/**
 * Discovery-pool category labels — covers both Reddit's DiscoveryTerm
 * categories (DISCOVERY_TERM_CATEGORIES) and X's XDiscoveryPhrase
 * categories (X_PHRASE_CATEGORIES), both in lib/ai/schemas.ts. The two
 * enums are deliberately separate (short topic concepts vs natural
 * conversational phrases) but share this one label map since a few names
 * overlap and none collide in meaning. "precision" isn't a generated
 * category in either pool; it's the campaign's own configured
 * keywords/topics, always-on.
 */
export const DISCOVERY_CATEGORY_LABELS: Record<string, string> = {
  precision: "Your keywords/topics",
  // DiscoveryTerm (Reddit)
  service: "Service",
  problem: "Problem",
  outcome: "Outcome",
  task: "Task",
  tool: "Tool",
  alternative: "Alternative",
  frustration: "Frustration",
  beginner_language: "Beginner language",
  advanced_language: "Advanced language",
  decision_language: "Decision language",
  recommendation_language: "Recommendation language",
  adjacent_concept: "Adjacent concept",
  other: "Other",
  // XDiscoveryPhrase (X/Twitter)
  direct_demand: "Direct demand",
  recommendation: "Recommendation",
  solution_seeking: "Solution seeking",
  comparison: "Comparison",
  tool_product_service: "Tool/product/service",
  customer_language: "Customer language",
};

/** Legacy labels for the retired family-bundle rotation system — kept only so conversations ingested before DiscoveryTerm shipped still resolve their original "discovered through" provenance via Conversation.foundBySurfaces. Never used for new data. */
export const LEGACY_SEARCH_FAMILY_LABELS: Record<string, string> = {
  baseline: "Your keywords/topics",
  buyer_request: "Buyer request",
  provider_search: "Provider search",
  recommendation: "Recommendation",
  problem: "Problem",
  solution: "Solution",
  goal: "Goal",
  planning: "Planning",
  comparison: "Comparison",
  alternative: "Alternative",
  troubleshooting: "Troubleshooting",
  dissatisfaction: "Dissatisfaction",
  urgency: "Urgency",
  beginner_confusion: "Beginner confusion",
  domain_topic: "Topic",
  local: "Local",
};

export const SOURCE_LABELS: Record<string, string> = {
  reddit: "Reddit",
  twitter: "X/Twitter",
  manual: "Manual",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/**
 * Customer-facing scan-availability copy. Deliberately never names a
 * vendor (Redditapis, TwitterAPIs, Gemini), an env var, or a balance —
 * those are operator/admin details, not something a managed-SaaS user
 * needs to see. But it still tells the truth about severity:
 * "not configured" is permanent until an operator acts (so it says so,
 * and never claims to be retrying), while a live provider fault really
 * does get retried automatically by the next scheduled scan, so saying
 * that is accurate, not a fabrication.
 */
export function scanDisabledReason(params: {
  sourceType: string;
  aiReady: boolean;
  healthStatus: "ok" | "not_configured" | "error";
}): string | undefined {
  if (params.sourceType === "manual") {
    return "This campaign uses manual import — add conversations directly below.";
  }
  if (!params.aiReady || params.healthStatus === "not_configured") {
    return "Live scanning isn't enabled for this campaign yet — contact support to turn it on.";
  }
  if (params.healthStatus === "error") {
    return "Scan engine temporarily paused — retrying automatically.";
  }
  return undefined;
}

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  reviewed: "Reviewed",
  saved: "Saved",
  dismissed: "Dismissed",
  contacted: "Contacted",
  replied: "Replied",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};
