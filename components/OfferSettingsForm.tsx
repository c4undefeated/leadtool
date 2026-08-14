"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { VerticalTemplate } from "@/lib/verticals";
import { updateOfferSettingsAction, type OfferSettingsState } from "@/lib/actions/settings";
import { WebsiteOfferScanner, type SiteOfferSuggestion } from "@/components/WebsiteOfferScanner";

type OfferValues = {
  verticalTemplateKey: string;
  businessType: string;
  whatYouSell: string;
  problemsSolved: string;
  idealCustomer: string;
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  geography: string | null;
  excludedAudiences: string | null;
  brandVoice: string | null;
  engagementStyle: string | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm tracking-wide px-5 py-2.5 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export function OfferSettingsForm({ templates, offer }: { templates: VerticalTemplate[]; offer: OfferValues }) {
  const [state, formAction] = useActionState<OfferSettingsState, FormData>(updateOfferSettingsAction, undefined);
  const [selected, setSelected] = useState<VerticalTemplate>(
    templates.find((t) => t.key === offer.verticalTemplateKey) ?? templates[0]!
  );
  const [suggestion, setSuggestion] = useState<SiteOfferSuggestion | null>(null);
  const [rev, setRev] = useState(0);
  const fieldKey = (prefix: string) => `${prefix}-${rev}`;

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
          key={fieldKey("bt")}
          defaultValue={suggestion?.businessType || offer.businessType}
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
          defaultValue={suggestion?.whatYouSell || offer.whatYouSell}
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
        />
      </label>

      <label className="text-sm text-muted">
        What problems do you solve?
        <textarea
          name="problemsSolved"
          key={fieldKey("ps")}
          defaultValue={suggestion?.problemsSolved || offer.problemsSolved}
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
          defaultValue={suggestion?.idealCustomer || offer.idealCustomer}
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
            defaultValue={offer.priceRangeMin ?? undefined}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          />
        </label>
        <label className="text-sm text-muted">
          Price range — to ($)
          <input
            name="priceRangeMax"
            type="number"
            min={0}
            defaultValue={offer.priceRangeMax ?? undefined}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          />
        </label>
      </div>

      <label className="text-sm text-muted">
        Geographic constraints (optional)
        <input
          name="geography"
          key={fieldKey("geo")}
          defaultValue={suggestion?.geography ?? offer.geography ?? ""}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          placeholder="e.g. Must be in Texas, or leave blank for remote/anywhere"
        />
      </label>

      <label className="text-sm text-muted">
        Who should Scout exclude? (optional)
        <input
          name="excludedAudiences"
          key={fieldKey("excl")}
          defaultValue={suggestion?.excludedAudiences ?? offer.excludedAudiences ?? ""}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          placeholder="e.g. Agencies looking to subcontract, students, competitors"
        />
      </label>

      <label className="text-sm text-muted">
        Brand voice
        <input
          name="brandVoice"
          defaultValue={offer.brandVoice ?? ""}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
          placeholder="e.g. Direct, no-nonsense, a little dry"
        />
      </label>

      <label className="text-sm text-muted">
        Preferred engagement style
        <select
          name="engagementStyle"
          defaultValue={offer.engagementStyle ?? "helpful_first"}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
        >
          <option value="helpful_first">Help first, mention what I do only if it fits</option>
          <option value="direct">Direct — I'm comfortable being upfront that I offer this</option>
        </select>
      </label>

      {state?.error && <p className="text-sm text-risk">{state.error}</p>}
      {state?.success && <p className="text-sm text-good">{state.success}</p>}
      <SubmitButton />
    </form>
  );
}
