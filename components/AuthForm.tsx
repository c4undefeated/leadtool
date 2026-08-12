"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AuthFormState } from "@/lib/actions/auth";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm tracking-wide py-2.5 disabled:opacity-60"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

export function AuthForm({
  action,
  mode,
}: {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  mode: "login" | "signup";
}) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {mode === "signup" && (
        <>
          <label className="text-sm text-muted">
            Your name
            <input name="name" className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2" />
          </label>
          <label className="text-sm text-muted">
            Business name
            <input
              name="companyName"
              required
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
            />
          </label>
        </>
      )}
      <label className="text-sm text-muted">
        Email
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
        />
      </label>
      <label className="text-sm text-muted">
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
        />
      </label>
      {state?.error && <p className="text-sm text-risk">{state.error}</p>}
      <SubmitButton label={mode === "login" ? "Log in" : "Create account"} />
    </form>
  );
}
