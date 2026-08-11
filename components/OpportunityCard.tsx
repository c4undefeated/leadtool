import Link from "next/link";
import { relativeTime, SAFETY_LABELS, ACTION_LABELS } from "@/lib/format";

export type CardOpportunity = {
  id: string;
  intentScore: number;
  fitScore: number;
  matchScore: number;
  confidence: string;
  detectedNeed: string;
  whyNow: string;
  reasoning: string;
  safetyLabel: string;
  recommendedAction: string;
  priorityTier: string;
  status: string;
  conversation: {
    title: string | null;
    originalText: string;
    url: string;
    community: string | null;
    postedAt: Date;
    source: string;
  };
};

export function OpportunityCard({ opportunity }: { opportunity: CardOpportunity }) {
  const safety = SAFETY_LABELS[opportunity.safetyLabel] ?? SAFETY_LABELS.caution!;

  return (
    <Link
      href={`/opportunities/${opportunity.id}`}
      className="block rounded-lg border border-line bg-white p-5 hover:border-accent/50 transition"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="font-mono text-xs text-muted">
          {opportunity.conversation.community ?? opportunity.conversation.source} ·{" "}
          {relativeTime(opportunity.conversation.postedAt)}
        </span>
        <span className="pill pill-accent">Match {opportunity.matchScore}</span>
      </div>

      <p className="font-serif italic text-ink mb-3 line-clamp-3">
        "{opportunity.conversation.originalText.slice(0, 220)}
        {opportunity.conversation.originalText.length > 220 ? "…" : ""}"
      </p>

      <div className="flex flex-wrap gap-4 mb-3 text-sm font-mono">
        <Score label="Intent" value={opportunity.intentScore} />
        <Score label="Fit" value={opportunity.fitScore} />
        <span className="text-muted">Confidence: {opportunity.confidence}</span>
      </div>

      <p className="text-sm text-muted mb-3">
        <span className="font-medium text-ink">Why now: </span>
        {opportunity.whyNow}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill ${safety.className}`}>{safety.text}</span>
        <span className="pill pill-neutral">{ACTION_LABELS[opportunity.recommendedAction] ?? opportunity.recommendedAction}</span>
      </div>
    </Link>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="text-muted">{label} </span>
      <span className="text-ink font-semibold">{value}</span>
    </span>
  );
}
