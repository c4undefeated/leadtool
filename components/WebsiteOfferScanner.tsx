"use client";

import { useState } from "react";

export type SiteOfferSuggestion = {
  siteTitle: string | null;
  confident: boolean;
  businessType: string;
  whatYouSell: string;
  problemsSolved: string;
  idealCustomer: string;
  geography: string | null;
  excludedAudiences: string | null;
};

/**
 * Shared "paste your website" entry point for both onboarding and Settings
 * → Offer. Scans the site and hands the resulting Offer-profile suggestion
 * to the parent form to prefill — it never saves anything itself. The
 * parent is expected to apply the suggestion via a defaultValue+remount-key
 * pattern (see OnboardingForm/OfferSettingsForm), the same way switching
 * vertical templates already works, so a human always reviews/edits before
 * anything is saved.
 */
export function WebsiteOfferScanner({ onSuggestion }: { onSuggestion: (s: SiteOfferSuggestion) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [appliedFrom, setAppliedFrom] = useState<string | undefined>();

  async function scan() {
    if (!url.trim()) return;
    setLoading(true);
    setError(undefined);
    setAppliedFrom(undefined);
    try {
      const res = await fetch("/api/enrich-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't scan that site.");
        return;
      }
      onSuggestion(data);
      setAppliedFrom(data.siteTitle || url.trim());
      if (!data.confident) {
        setError("Scout couldn't tell much from that page — check the fields below carefully before saving.");
      }
    } catch {
      setError("Couldn't reach the enrichment endpoint — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-paper p-4 mb-6">
      <p className="text-sm font-medium mb-1">Or paste your website</p>
      <p className="text-xs text-muted mb-3">
        Scout will read your site and fill in the fields below from it — nothing is saved until you review and
        submit. Optional; you can always just type the fields in yourself.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourbusiness.com"
          className="flex-1 min-w-[220px] rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading || !url.trim()}
          onClick={scan}
          className="rounded-md border border-line px-4 py-2 text-sm hover:border-ink/30 disabled:opacity-60"
        >
          {loading ? "Reading site…" : "Scan site"}
        </button>
      </div>
      {appliedFrom && !error && <p className="text-xs text-good mt-2">Filled in from "{appliedFrom}" — review below.</p>}
      {error && <p className="text-xs text-caution mt-2">{error}</p>}
    </div>
  );
}
