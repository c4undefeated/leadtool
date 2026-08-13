"use client";

import { useState, useTransition } from "react";
import { runScanAction, type ScanBreakdown, type ScanState } from "@/lib/actions/conversations";

export function RunScanButton({ campaignId, disabled, disabledReason }: { campaignId: string; disabled?: boolean; disabledReason?: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ScanState>();

  return (
    <div>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await runScanAction(campaignId);
            setMessage(result);
          })
        }
        className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm px-4 py-2 disabled:opacity-50"
        title={disabled ? disabledReason : undefined}
      >
        {pending ? "Scanning…" : "Run scan"}
      </button>
      {disabled && disabledReason && <p className="text-xs text-muted mt-1">{disabledReason}</p>}
      {message?.error && <p className="text-sm text-risk mt-2">{message.error}</p>}
      {message?.result && <ScanSummaryBanner result={message.result} />}
    </div>
  );
}

function ScanSummaryBanner({ result }: { result: ScanBreakdown }) {
  return (
    <div className="mt-2 rounded-md border border-line bg-surface px-3 py-2">
      <p className="text-sm text-good mb-1">
        Scan complete{result.cacheHit ? " — served from cache, no provider call made" : ""}.
      </p>
      <p className="text-xs font-mono text-muted">
        <span className="text-ink">{result.opportunitiesCreated}</span> opportunit{result.opportunitiesCreated === 1 ? "y" : "ies"} created
        {" · "}
        <span className="text-ink">{result.conversationsIngested}</span> ingested
        {" · "}
        <span
          className="text-ink"
          title="Already-seen posts (same source + ID) — never re-analyzed, zero additional cost."
        >
          {result.skippedDuplicates}
        </span>{" "}
        duplicate{result.skippedDuplicates === 1 ? "" : "s"} skipped
        {" · "}
        <span
          className="text-ink"
          title="Deleted/removed, too short, or spam/bot boilerplate — dropped before reaching Gemini to protect analysis spend."
        >
          {result.skippedJunk}
        </span>{" "}
        junk post{result.skippedJunk === 1 ? "" : "s"} dropped
      </p>
      {result.conversationsIngested > 0 && result.opportunitiesCreated === 0 && (
        <p className="text-xs text-muted mt-1 italic">No strong opportunities today — that's a valid, honest result.</p>
      )}
    </div>
  );
}
