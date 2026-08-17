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

/** Campaign.lastScanStatus labels — see lib/dailyScan.ts's classifyScanStatus for exactly how a scan result maps to one of these, plus the "running" state set the moment a scan is claimed. */
export const SCAN_STATUS_LABELS: Record<string, { text: string; className: string }> = {
  running: { text: "Scanning…", className: "pill-neutral" },
  completed: { text: "Completed", className: "pill-good" },
  failed: { text: "Failed — retrying automatically", className: "pill-caution" },
  not_configured: { text: "Needs setup", className: "pill-risk" },
};

// The daily cron's fixed trigger time (see vercel.json's "20 18 * * *") —
// 18:20 UTC, which is 2:20 PM Eastern Daylight Time (roughly Mar-Nov) or
// 1:20 PM Eastern Standard Time (roughly Nov-Mar). Vercel cron schedules
// are fixed UTC and do not shift for daylight saving, so this drifts an
// hour relative to clock-on-the-wall Eastern time for part of the year —
// documented tradeoff (see the cron route's own comment), not a bug.
const DAILY_SCAN_UTC_HOUR = 18;
const DAILY_SCAN_UTC_MINUTE = 20;

/**
 * The next occurrence of the daily cron's scheduled UTC time, purely for
 * passive "next scan" UI copy — informational only. The cron's actual due
 * logic (lib/dailyScan.ts's isCampaignDue) is independent of this and
 * governs what really happens; this just describes it to a user in plain
 * language.
 */
export function nextDailyScanAt(from: Date = new Date()): Date {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), DAILY_SCAN_UTC_HOUR, DAILY_SCAN_UTC_MINUTE, 0, 0));
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

// This renders server-side (a Server Component, no browser timezone
// available), and the target audience is explicitly US Eastern-time
// businesses — so format in America/New_York explicitly via Intl (whose
// IANA tzdata handles the EDT/EST switch correctly on its own) rather than
// relying on the server process's own local timezone, which on a typical
// Vercel deployment is UTC and would otherwise show a misleading time.
function easternDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "today, ~2:20 PM EDT" / "tomorrow, ~1:20 PM EST" — correct for either side of the DST switch, regardless of the server's own local timezone. */
export function describeNextScan(from: Date = new Date()): string {
  const next = nextDailyScanAt(from);
  const isToday = easternDateKey(next) === easternDateKey(from);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(next);
  return `${isToday ? "today" : "tomorrow"}, ~${time}`;
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
