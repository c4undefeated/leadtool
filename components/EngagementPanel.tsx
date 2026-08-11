"use client";

import { useState, useTransition } from "react";
import { generateEngagementAction } from "@/lib/actions/engagement";
import { ACTION_LABELS } from "@/lib/format";

type Draft = { text: string; whyThisResponse: string; version: number } | null;
type Recommendation = {
  id: string;
  strategy: string;
  strategyReason: string;
  createdAt: string | Date;
  commentDraft: Draft;
  dmDraft: Draft;
};

export function EngagementPanel({
  opportunityId,
  originalUrl,
  initial,
}: {
  opportunityId: string;
  originalUrl: string;
  initial: Recommendation | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const hasGenerated = initial !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await generateEngagementAction(opportunityId);
              setError(result?.error);
            })
          }
          className="rounded-md bg-ink text-paper font-mono text-sm px-4 py-2 disabled:opacity-60"
        >
          {pending ? "Thinking…" : hasGenerated ? "Regenerate" : "Recommend engagement"}
        </button>
        <a
          href={originalUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-line px-4 py-2 text-sm font-mono"
        >
          Open original
        </a>
      </div>
      {error && <p className="text-sm text-risk">{error}</p>}

      {initial && (
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-sm mb-3">
            <span className="font-medium">Recommended: </span>
            {ACTION_LABELS[initial.strategy] ?? initial.strategy}
            <span className="text-muted"> — {initial.strategyReason}</span>
          </p>
          {initial.commentDraft && <DraftBox label="Comment draft" draft={initial.commentDraft} />}
          {initial.dmDraft && <DraftBox label="DM draft" draft={initial.dmDraft} />}
          {!initial.commentDraft && !initial.dmDraft && (
            <p className="text-sm text-muted italic">Scout recommends watching this one, not engaging yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function DraftBox({ label, draft }: { label: string; draft: NonNullable<Draft> }) {
  const [text, setText] = useState(draft.text);
  const [copied, setCopied] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  return (
    <div className="mb-4 last:mb-0">
      <p className="text-xs font-mono uppercase tracking-widest text-muted mb-1">{label}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs font-mono rounded-md border border-line px-3 py-1.5"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => setShowWhy((s) => !s)}
          className="text-xs font-mono text-accent underline"
        >
          Why this response?
        </button>
      </div>
      {showWhy && <p className="text-sm text-muted mt-2 italic">{draft.whyThisResponse}</p>}
    </div>
  );
}
