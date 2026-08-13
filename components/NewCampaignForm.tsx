"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createCampaignAction, type SimpleFormState } from "@/lib/actions/campaigns";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm px-4 py-2 disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create campaign"}
    </button>
  );
}

export function NewCampaignForm({ showSourcePicker = false }: { showSourcePicker?: boolean }) {
  const [state, formAction] = useActionState<SimpleFormState, FormData>(createCampaignAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input
        name="name"
        required
        placeholder="e.g. Fitness coaching — US"
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
      />
      {showSourcePicker && (
        <fieldset className="flex gap-4 text-sm">
          <legend className="text-xs font-mono text-muted mb-1">Source</legend>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="sourceType" value="reddit" defaultChecked className="accent-accent" />
            Reddit
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="sourceType" value="twitter" className="accent-accent" />
            X/Twitter
          </label>
        </fieldset>
      )}
      {state?.error && <p className="text-sm text-risk">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
