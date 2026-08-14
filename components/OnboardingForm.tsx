"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { VerticalTemplate } from "@/lib/verticals";
import { completeOnboardingAction, type OnboardingFormState } from "@/lib/actions/onboarding";
import { WebsiteOfferScanner, type SiteOfferSuggestion } from "@/components/WebsiteOfferScanner";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm tracking-wide px-5 py-2.5 disabled:opacity-60"
    >
      {pending ? "Setting up…" : "Start scanning"}
    </button>
  );
}

export function OnboardingForm({ templates }: { templates: VerticalTemplate[] }) {
  const [state, formAction] = useActionState<OnboardingFormState, FormData>(
    completeOnboardingAction,
    undefined
  );
  const [selected, setSelected] = useState<VerticalTemplate>(templates[0]!);
  const [suggestion, setSuggestion] = useState<SiteOfferSuggestion | null>(null);
  const [rev, setRev] = useState(0);
  const fieldKey = (prefix: string) => `${prefix}-${selected.key}-${rev}`;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <WebsiteOfferScanner
        onSuggestion={(s) => {
          setSuggestion(s);
          setRev((r) => r + 1);
        }}
      />

      <div>
        <p className="text-sm font-medium mb-2">Closest to your business</p>
        <input type="hidden" name="verticalTemplateKey" value={selected.key} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {templates.map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => setSelected(t)}
              className={`text-left rounded-md border px-3 py-2 text-sm transition ${
                selected.key === t.key
                  ? "border-accent bg-accent/10 text-ink"
                  : "border-line bg-surface text-muted hover:border-ink/30"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="text-sm text-muted">
        Business type
        <input
          name="businessType"
          defaultValue={suggestion?.businessType || (selected.label !== "Other" ? selected.label : "")}
          key={fieldKey("bt")}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          placeholder="e.g. Online strength coaching"
        />
      </label>

      <label className="text-sm text-muted">
        What do you sell?
        <textarea
          name="whatYouSell"
          required
          key={fieldKey("wys")}
          defaultValue={suggestion?.whatYouSell || selected.exampleWhatYouSell}
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
        />
      </label>

      <label className="text-sm text-muted">
        What problems do you solve?
        <textarea
          name="problemsSolved"
          key={fieldKey("ps")}
          defaultValue={suggestion?.problemsSolved || selected.exampleProblemsSolved}
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
        />
      </label>

      <label className="text-sm text-muted">
        Who's your ideal customer?
        <textarea
          name="idealCustomer"
          required
          key={fieldKey("ic")}
          defaultValue={suggestion?.idealCustomer || selected.exampleIdealCustomer}
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-muted">
          Price range — from ($)
          <input
            name="priceRangeMin"
            type="number"
            min={0}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          />
        </label>
        <label className="text-sm text-muted">
          Price range — to ($)
          <input
            name="priceRangeMax"
            type="number"
            min={0}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          />
        </label>
      </div>

      <label className="text-sm text-muted">
        Geographic constraints (optional)
        <input
          name="geography"
          key={fieldKey("geo")}
          defaultValue={suggestion?.geography ?? ""}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          placeholder="e.g. Must be in Texas, or leave blank for remote/anywhere"
        />
      </label>

      <label className="text-sm text-muted">
        Who should Scout exclude? (optional)
        <input
          name="excludedAudiences"
          key={fieldKey("excl")}
          defaultValue={suggestion?.excludedAudiences ?? ""}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          placeholder="e.g. Agencies looking to subcontract, students, competitors"
        />
      </label>

      <label className="text-sm text-muted">
        Brand voice
        <input
          name="brandVoice"
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          placeholder="e.g. Direct, no-nonsense, a little dry"
        />
      </label>

      <label className="text-sm text-muted">
        Preferred engagement style
        <select
          name="engagementStyle"
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          defaultValue="helpful_first"
        >
          <option value="helpful_first">Help first, mention what I do only if it fits</option>
          <option value="direct">Direct — I'm comfortable being upfront that I offer this</option>
        </select>
      </label>

      {state?.error && <p className="text-sm text-risk">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
