"use client";

import { useState, useTransition } from "react";
import { addExclusionsBulkAction, addKeywordsBulkAction } from "@/lib/actions/campaigns";

type Suggestions = {
  siteTitle: string | null;
  siteDescription: string | null;
  buyerKeywords: string[];
  topicTerms: string[];
  targetSubreddits: string[];
  excludedTerms: string[];
};

export function WebsiteEnrichmentPanel({ campaignId, sourceType }: { campaignId: string; sourceType: string }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [checkedKeywords, setCheckedKeywords] = useState<Set<string>>(new Set());
  const [checkedTopics, setCheckedTopics] = useState<Set<string>>(new Set());
  const [checkedSubreddits, setCheckedSubreddits] = useState<Set<string>>(new Set());
  const [checkedExclusions, setCheckedExclusions] = useState<Set<string>>(new Set());
  const [applyPending, startApply] = useTransition();
  const [applied, setApplied] = useState<string | undefined>();
  // Topic terms are only meaningful to the Reddit adapter's boolean query
  // strategy (lib/sources/redditApisAdapter.ts) — suggesting them for a
  // Twitter or manual campaign would silently store something nothing
  // ever reads or shows back.
  const showTopics = sourceType === "reddit";

  async function scan() {
    if (!url.trim()) return;
    setLoading(true);
    setError(undefined);
    setSuggestions(null);
    setApplied(undefined);
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
      setSuggestions(data);
      setCheckedKeywords(new Set(data.buyerKeywords));
      setCheckedTopics(new Set(showTopics ? data.topicTerms : []));
      setCheckedSubreddits(new Set(data.targetSubreddits));
      setCheckedExclusions(new Set(data.excludedTerms));
    } catch {
      setError("Couldn't reach the enrichment endpoint — try again.");
    } finally {
      setLoading(false);
    }
  }

  function applySelected() {
    startApply(async () => {
      const [k, t, s, e] = await Promise.all([
        addKeywordsBulkAction(campaignId, Array.from(checkedKeywords), "keyword"),
        addKeywordsBulkAction(campaignId, Array.from(checkedTopics), "topic"),
        addKeywordsBulkAction(campaignId, Array.from(checkedSubreddits), "subreddit"),
        addExclusionsBulkAction(campaignId, Array.from(checkedExclusions)),
      ]);
      const total = k.added + t.added + s.added + e.added;
      setApplied(total > 0 ? `Added ${total} suggestion${total === 1 ? "" : "s"} to the campaign below.` : "Nothing selected to add.");
      setSuggestions(null);
    });
  }

  const totalChecked = checkedKeywords.size + checkedTopics.size + checkedSubreddits.size + checkedExclusions.size;

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="font-medium text-sm mb-1">Analyze website for auto-keywords</h2>
      <p className="text-sm text-muted mb-4">
        Optional — paste your site and Scout will suggest a starting keyword, community, and exclusion list from
        your own copy. Nothing is saved until you review and add it below; the manual fields underneath still work
        exactly the same either way.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourbusiness.com"
          className="flex-1 min-w-[220px] rounded-md border border-line bg-paper px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading || !url.trim()}
          onClick={scan}
          className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm px-4 py-2 disabled:opacity-60"
        >
          {loading ? "Scanning…" : "Scan site & build keyword list"}
        </button>
      </div>

      {error && <p className="text-sm text-risk mb-2">{error}</p>}
      {applied && <p className="text-sm text-good mb-2">{applied}</p>}

      {suggestions && (
        <div className="rounded-md border border-line bg-paper p-4 flex flex-col gap-4 mt-2">
          {suggestions.siteTitle && <p className="text-xs text-muted italic">Read as: "{suggestions.siteTitle}"</p>}

          {suggestions.buyerKeywords.length === 0 &&
          (!showTopics || suggestions.topicTerms.length === 0) &&
          suggestions.targetSubreddits.length === 0 &&
          suggestions.excludedTerms.length === 0 ? (
            <p className="text-sm text-muted">
              Scout couldn't confidently tell what this business sells from that page — no suggestions to show.
              That's an honest result, not a bug; try a page with more real copy on it.
            </p>
          ) : (
            <>
              <SuggestionGroup
                label="High-intent buyer keywords"
                items={suggestions.buyerKeywords}
                checked={checkedKeywords}
                setChecked={setCheckedKeywords}
              />
              {showTopics && (
                <SuggestionGroup
                  label="Topic terms (broadens Reddit search beyond exact keyword matches)"
                  items={suggestions.topicTerms}
                  checked={checkedTopics}
                  setChecked={setCheckedTopics}
                />
              )}
              <SuggestionGroup
                label="Target subreddits (unverified — check these exist before scanning)"
                items={suggestions.targetSubreddits}
                checked={checkedSubreddits}
                setChecked={setCheckedSubreddits}
              />
              <SuggestionGroup
                label="Suggested exclusions"
                items={suggestions.excludedTerms}
                checked={checkedExclusions}
                setChecked={setCheckedExclusions}
              />
              <div>
                <button
                  type="button"
                  disabled={applyPending || totalChecked === 0}
                  onClick={applySelected}
                  className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm px-4 py-2 disabled:opacity-60"
                >
                  {applyPending ? "Adding…" : `Add ${totalChecked} selected to campaign`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function SuggestionGroup({
  label,
  items,
  checked,
  setChecked,
}: {
  label: string;
  items: string[];
  checked: Set<string>;
  setChecked: (updater: (prev: Set<string>) => Set<string>) => void;
}) {
  if (items.length === 0) return null;

  function toggle(item: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-muted font-mono mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <label
            key={item}
            className={`text-xs font-mono rounded-full border px-3 py-1.5 cursor-pointer select-none ${
              checked.has(item) ? "border-accent text-accent bg-accent/10" : "border-line text-muted"
            }`}
          >
            <input type="checkbox" checked={checked.has(item)} onChange={() => toggle(item)} className="hidden" />
            {item}
          </label>
        ))}
      </div>
    </div>
  );
}
