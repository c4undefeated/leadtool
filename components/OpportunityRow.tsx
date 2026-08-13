"use client";

import Link from "next/link";
import { useTransition } from "react";
import { relativeTime, SAFETY_LABELS, STATUS_LABELS, INTENT_CATEGORY_LABELS, sourceLabel } from "@/lib/format";
import { updateOpportunityStatusAction } from "@/lib/actions/opportunities";
import type { RowOpportunity } from "./OpportunitiesExplorer";

const TIER_CLASS: Record<string, string> = {
  high: "pill-accent",
  potential: "pill-caution",
  low: "pill-neutral",
};

const STATUS_OPTIONS = ["new", "reviewed", "saved", "contacted", "replied", "qualified", "won", "lost", "dismissed"];

export function OpportunityRow({
  opportunity,
  selected,
  onToggleSelect,
}: {
  opportunity: RowOpportunity;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const safety = SAFETY_LABELS[opportunity.safetyLabel] ?? SAFETY_LABELS.caution!;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 hover:border-accent/50 transition">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(opportunity.id)}
        className="mt-1.5 shrink-0 accent-accent"
        aria-label="Select opportunity"
      />

      <Link href={`/opportunities/${opportunity.id}`} className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="pill pill-neutral shrink-0">{sourceLabel(opportunity.conversation.source)}</span>
          <span className={`pill ${TIER_CLASS[opportunity.priorityTier] ?? "pill-neutral"} shrink-0`}>
            Match {opportunity.matchScore}
          </span>
          <span className={`pill ${safety.className} shrink-0`}>{safety.text}</span>
          {opportunity.intentCategory && (
            <span className="pill pill-neutral shrink-0">{INTENT_CATEGORY_LABELS[opportunity.intentCategory] ?? opportunity.intentCategory}</span>
          )}
          <span className="text-xs font-mono text-muted truncate">
            {opportunity.conversation.community ?? opportunity.conversation.source}
            {opportunity.conversation.authorRef ? ` · ${opportunity.conversation.authorRef}` : ""} ·{" "}
            {relativeTime(opportunity.conversation.postedAt)}
          </span>
        </div>
        {opportunity.conversation.title && (
          <p className="font-medium text-sm truncate mb-0.5">{opportunity.conversation.title}</p>
        )}
        <p className="text-sm text-muted line-clamp-1">{opportunity.conversation.originalText}</p>
      </Link>

      <select
        defaultValue={opportunity.status}
        disabled={pending}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const formData = new FormData();
          formData.set("opportunityId", opportunity.id);
          formData.set("status", e.target.value);
          startTransition(() => updateOpportunityStatusAction(formData));
        }}
        className="shrink-0 rounded-md border border-line bg-paper px-2 py-1.5 text-xs font-mono disabled:opacity-60"
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
