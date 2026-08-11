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
