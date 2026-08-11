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
      className="rounded-md bg-ink text-paper font-mono text-sm px-4 py-2 disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create campaign"}
    </button>
  );
}

export function NewCampaignForm() {
  const [state, formAction] = useActionState<SimpleFormState, FormData>(createCampaignAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input
        name="name"
        required
        placeholder="e.g. Fitness coaching — US"
        className="rounded-md border border-line bg-white px-3 py-2 text-sm"
      />
      {state?.error && <p className="text-sm text-risk">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
