"use client";

import { useMemo, useState, useTransition } from "react";
import { OpportunityRow } from "./OpportunityRow";
import { bulkDismissAction } from "@/lib/actions/opportunities";
import { sourceLabel, INTENT_CATEGORY_LABELS } from "@/lib/format";

export type RowOpportunity = {
  id: string;
  matchScore: number;
  priorityTier: string;
  safetyLabel: string;
  intentCategory: string | null;
  status: string;
  conversation: {
    title: string | null;
    originalText: string;
    community: string | null;
    authorRef: string | null;
    postedAt: Date;
    source: string;
  };
};

const STATUS_GROUP: Record<string, "new" | "contacted" | "closed"> = {
  new: "new",
  reviewed: "new",
  saved: "new",
  contacted: "contacted",
  replied: "contacted",
  qualified: "contacted",
  dismissed: "closed",
  won: "closed",
  lost: "closed",
};

export function OpportunitiesExplorer({
  opportunities,
  configuredSources = [],
}: {
  opportunities: RowOpportunity[];
  /** Every sourceType the company's campaigns are actually configured for (e.g. reddit, twitter, manual) — unioned with sources found on existing opportunities below, so a source with zero opportunities so far still appears as a real filter option instead of looking unconfigured. */
  configuredSources?: string[];
}) {
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<"all" | "high" | "potential" | "low">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "contacted" | "closed">("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "match" | "oldest">("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [bulkMessage, setBulkMessage] = useState<string | undefined>();

  const platforms = useMemo(
    () => Array.from(new Set([...configuredSources, ...opportunities.map((o) => o.conversation.source)])),
    [opportunities, configuredSources],
  );

  const categories = useMemo(
    () => Array.from(new Set(opportunities.map((o) => o.intentCategory).filter((c): c is string => Boolean(c)))),
    [opportunities],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = opportunities.filter((o) => {
      if (matchFilter !== "all" && o.priorityTier !== matchFilter) return false;
      if (statusFilter !== "all" && STATUS_GROUP[o.status] !== statusFilter) return false;
      if (platformFilter !== "all" && o.conversation.source !== platformFilter) return false;
      if (categoryFilter !== "all" && o.intentCategory !== categoryFilter) return false;
      if (q) {
        const haystack = `${o.conversation.title ?? ""} ${o.conversation.originalText}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    result = [...result].sort((a, b) => {
      if (sortBy === "match") return b.matchScore - a.matchScore;
      if (sortBy === "oldest") return a.conversation.postedAt.getTime() - b.conversation.postedAt.getTime();
      return b.conversation.postedAt.getTime() - a.conversation.postedAt.getTime();
    });
    return result;
  }, [opportunities, search, matchFilter, statusFilter, platformFilter, categoryFilter, sortBy]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const allVisible = filtered.every((o) => prev.has(o.id));
      if (allVisible) return new Set();
      return new Set(filtered.map((o) => o.id));
    });
  }

  function dismissSelected() {
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await bulkDismissAction(ids);
      setBulkMessage(`Dismissed ${result.dismissed}.`);
      setSelected(new Set());
      setTimeout(() => setBulkMessage(undefined), 3000);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted font-mono shrink-0">{filtered.length} results</p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or text…"
          className="flex-1 min-w-[180px] rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-md border border-line bg-surface px-2 py-2 text-sm font-mono"
        >
          <option value="newest">Newest found</option>
          <option value="match">Highest match</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <FilterTabs
          label="Match"
          value={matchFilter}
          onChange={(v) => setMatchFilter(v as typeof matchFilter)}
          options={[
            ["all", "All"],
            ["high", "High"],
            ["potential", "Potential"],
            ["low", "Low"],
          ]}
        />
        <FilterTabs
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          options={[
            ["all", "All"],
            ["new", "New"],
            ["contacted", "Contacted"],
            ["closed", "Closed"],
          ]}
        />
        {platforms.length > 1 && (
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs font-mono"
          >
            <option value="all">All platforms</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {sourceLabel(p)}
              </option>
            ))}
          </select>
        )}
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs font-mono"
          >
            <option value="all">All intent types</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {INTENT_CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="rounded-lg border border-line bg-paper px-4 py-2.5 flex flex-wrap items-center gap-3">
        <label className="text-xs font-mono text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={filtered.length > 0 && filtered.every((o) => selected.has(o.id))}
            onChange={selectAllVisible}
            className="accent-accent"
          />
          Select visible
        </label>
        {selected.size === 0 ? (
          <p className="text-xs text-muted">Select opportunities to dismiss them in bulk.</p>
        ) : (
          <>
            <p className="text-xs text-muted">{selected.size} selected</p>
            <button
              type="button"
              disabled={pending}
              onClick={dismissSelected}
              className="text-xs font-mono rounded-md border border-line px-3 py-1.5 hover:border-risk hover:text-risk disabled:opacity-60"
            >
              {pending ? "Dismissing…" : "Dismiss selected"}
            </button>
          </>
        )}
        {bulkMessage && <p className="text-xs text-good">{bulkMessage}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
            <p className="text-muted text-sm">No opportunities match these filters.</p>
          </div>
        ) : (
          filtered.map((o) => (
            <OpportunityRow key={o.id} opportunity={o} selected={selected.has(o.id)} onToggleSelect={toggleSelect} />
          ))
        )}
      </div>
    </div>
  );
}

function FilterTabs<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="text-muted">{label}</span>
      <div className="flex rounded-md border border-line overflow-hidden">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`px-2.5 py-1.5 ${value === v ? "bg-accent text-paper" : "hover:bg-surface"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
