import Link from "next/link";
import { relativeTime, SAFETY_LABELS, ACTION_LABELS, INTENT_CATEGORY_LABELS } from "@/lib/format";
import { updateOpportunityStatusAction } from "@/lib/actions/opportunities";

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
  intentCategory: string | null;
  priorityTier: string;
  status: string;
  conversation: {
    title: string | null;
    originalText: string;
    url: string;
    community: string | null;
    authorRef: string | null;
    postedAt: Date;
    source: string;
  };
};

export function OpportunityCard({ opportunity }: { opportunity: CardOpportunity }) {
  const safety = SAFETY_LABELS[opportunity.safetyLabel] ?? SAFETY_LABELS.caution!;

  return (
    <div className="rounded-lg border border-line bg-surface hover:border-accent/50 transition flex flex-col">
      <Link href={`/opportunities/${opportunity.id}`} className="block p-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="font-mono text-xs text-muted">
            {opportunity.conversation.community ?? opportunity.conversation.source}
            {opportunity.conversation.authorRef ? ` · ${opportunity.conversation.authorRef}` : ""} ·{" "}
            {relativeTime(opportunity.conversation.postedAt)}
          </span>
          <span className="pill pill-accent shrink-0">Match {opportunity.matchScore}</span>
        </div>

        {opportunity.conversation.title && (
          <p className="font-medium text-sm mb-1 line-clamp-1">{opportunity.conversation.title}</p>
        )}

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
          {opportunity.intentCategory && (
            <span className="pill pill-neutral">{INTENT_CATEGORY_LABELS[opportunity.intentCategory] ?? opportunity.intentCategory}</span>
          )}
        </div>
      </Link>

      <div className="flex items-center gap-3 px-5 py-3 border-t border-line">
        <a
          href={opportunity.conversation.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-mono text-accent underline"
        >
          Open original
        </a>
        <form action={updateOpportunityStatusAction} className="ml-auto">
          <input type="hidden" name="opportunityId" value={opportunity.id} />
          <input type="hidden" name="status" value="dismissed" />
          <button type="submit" className="text-xs font-mono text-muted hover:text-risk p-2 -m-2">
            Dismiss
          </button>
        </form>
      </div>
    </div>
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
