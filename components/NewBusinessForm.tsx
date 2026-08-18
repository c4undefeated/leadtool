"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createBusinessAction, type BusinessActionState } from "@/lib/actions/business";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm tracking-wide py-2.5 disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create business"}
    </button>
  );
}

export function NewBusinessForm() {
  const [state, formAction] = useActionState<BusinessActionState, FormData>(createBusinessAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="text-sm text-muted">
        Business name
        <input
          name="name"
          required
          autoFocus
          placeholder="e.g. My SaaS Company"
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
        />
      </label>
      {state?.error && <p className="text-sm text-risk">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
