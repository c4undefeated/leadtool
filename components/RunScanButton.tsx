"use client";

import { useState, useTransition } from "react";
import { runScanAction } from "@/lib/actions/conversations";

export function RunScanButton({ campaignId, disabled, disabledReason }: { campaignId: string; disabled?: boolean; disabledReason?: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string } | undefined>();

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
      {message?.success && <p className="text-sm text-good mt-2">{message.success}</p>}
    </div>
  );
}
