"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { importConversationAction, type ImportFormState } from "@/lib/actions/conversations";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm px-4 py-2 disabled:opacity-60"
    >
      {pending ? "Analyzing…" : "Analyze this conversation"}
    </button>
  );
}

export function ImportConversationForm({ campaignId }: { campaignId: string }) {
  const [state, formAction] = useActionState<ImportFormState, FormData>(importConversationAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <label className="text-sm text-muted">
        Original conversation text
        <textarea
          name="originalText"
          required
          rows={4}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          placeholder="Paste the post or comment text exactly as written."
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-muted">
          Link to original
          <input
            name="url"
            required
            type="url"
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
            placeholder="https://reddit.com/..."
          />
        </label>
        <label className="text-sm text-muted">
          Community (optional)
          <input
            name="community"
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
            placeholder="e.g. r/Fitness"
          />
        </label>
      </div>
      <label className="text-sm text-muted">
        Title (optional)
        <input name="title" className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2" />
      </label>
      {state?.error && <p className="text-sm text-risk">{state.error}</p>}
      {state?.success && <p className="text-sm text-good">{state.success}</p>}
      <SubmitButton />
    </form>
  );
}
