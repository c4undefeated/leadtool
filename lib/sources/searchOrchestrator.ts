import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/concurrency";
import * as redditapis from "@/lib/providers/redditapis/service";
import { RedditapisBudgetExceededError, type RedditapisPost } from "@/lib/providers/redditapis/service";
import { generateDiscoveryTerms, hashOfferForDiscovery, DISCOVERY_PROMPT_VERSION } from "@/lib/ai/discovery";
import type { DiscoveryTerm, Offer } from "@prisma/client";

/**
 * Retrieval architecture: broad discovery -> semantic qualification.
 *
 * This module owns discovery retrieval for Reddit: the "precision" layer
 * (a campaign's own manual keywords/topics, always-on) plus a rotated,
 * budget-respecting batch of individually-tracked AI-generated discovery
 * terms (lib/ai/discovery.ts). lib/sources/redditApisAdapter.ts stays a
 * thin execution/normalization layer that calls runDiscovery() and turns
 * whatever it returns into NormalizedConversation[] — it does not decide
 * what to search for. lib/providers/redditapis/service.ts remains the ONLY
 * thing that ever calls the Redditapis client — every query this module
 * runs goes through searchRedditapis(), so cache -> budget -> network ->
 * ledger is preserved exactly as before, just called more than once per
 * scan.
 *
 * Precision layer: the campaign's manual keyword/topic phrases, unconditionally
 * OR'd together. No fixed intent-word gate — Gemini alone judges intent,
 * after retrieval, on whatever text actually comes back. Manual keywords are
 * a precision option, not the primary discovery mechanism.
 *
 * Discovery layer: DiscoveryTerm rows (up to a few hundred per campaign,
 * see lib/ai/discovery.ts) are individually ranked (rankTerms) and the
 * highest-scoring ones this scan are packed into a small, bounded number of
 * OR-grouped provider calls (packTermBatches) — enough terms to matter,
 * few enough calls to stay cheap. A returned post is attributed to whichever
 * specific term(s) in its batch literally appear in its text; when none do
 * (Redditapis's own relevance matching isn't a literal substring match
 * either), credit is honestly spread across the whole batch rather than
 * guessed at.
 */

const MAX_PHRASE_GROUP_LENGTH = 400;
// The precision layer gets a slightly larger budget than a single discovery
// batch — it's one always-on call for the campaign's own (typically much
// smaller) manual keyword/topic list, not something rotation needs to keep
// small to bound provider-call count.
const PRECISION_QUERY_MAX_LENGTH = 600;

function buildPhraseGroup(phrases: string[], maxLength: number): string {
  const parts: string[] = [];
  let length = 0;
  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    const quoted = `"${trimmed.replace(/"/g, "")}"`;
    const addition = (parts.length === 0 ? "" : " OR ") + quoted;
    if (length + addition.length > maxLength) break;
    parts.push(quoted);
    length += addition.length;
  }
  return parts.join(" OR ");
}

/**
 * The campaign's precision layer — manual keywords and topics, unconditionally
 * OR'd together, no intent-word requirement. Always runs alongside the
 * rotated discovery batches below.
 */
export function buildBaselineQuery(keywords: string[], topics: string[]): string {
  return buildPhraseGroup([...keywords, ...topics], PRECISION_QUERY_MAX_LENGTH);
}

type TermRef = { id: string; term: string };
type TermBatch = { termIds: string[]; termTexts: string[]; query: string };

function finalizeBatch(items: TermRef[]): TermBatch {
  return {
    termIds: items.map((c) => c.id),
    termTexts: items.map((c) => c.term),
    query: items.map((c) => `"${c.term.trim().replace(/"/g, "")}"`).join(" OR "),
  };
}

/**
 * Packs ranked discovery terms into a bounded number of OR-grouped queries.
 * This is what keeps a large term pool cheap: instead of one provider call
 * per term, as many terms as fit under maxLength share one call, and no
 * more than maxBatches calls are ever made regardless of how many terms
 * were selected for this scan. A single term longer than maxLength still
 * gets its own batch rather than being silently dropped.
 */
export function packTermBatches(terms: TermRef[], maxBatches: number, maxLength: number): TermBatch[] {
  const batches: TermBatch[] = [];
  let current: TermRef[] = [];
  let currentLength = 0;

  for (const t of terms) {
    if (batches.length >= maxBatches) break;
    const trimmed = t.term.trim();
    if (!trimmed) continue;
    const quoted = `"${trimmed.replace(/"/g, "")}"`;
    const addition = current.length === 0 ? quoted.length : ` OR ${quoted}`.length;

    if (current.length > 0 && currentLength + addition > maxLength) {
      batches.push(finalizeBatch(current));
      current = [];
      currentLength = 0;
      if (batches.length >= maxBatches) break;
    }

    current.push(t);
    currentLength += current.length === 1 ? quoted.length : addition;
  }

  if (current.length > 0 && batches.length < maxBatches) {
    batches.push(finalizeBatch(current));
  }

  return batches;
}

const PRIORITY_BASE: Record<string, number> = { high: 30, medium: 20, low: 10 };

type RankedTerm = { term: DiscoveryTerm; score: number };

/**
 * Exploration + exploitation over individual terms, not "repeat the same
 * queries forever":
 * - base: Gemini's own stated confidence for this concept (priority).
 * - explorationBonus: never-used terms get a strong flat boost (every
 *   concept eventually gets tried at least once); used terms get a smaller
 *   bonus that grows the longer it's been since they last ran, capped at 30
 *   after ~6 days idle, so rotation actually rotates through a large pool.
 * - yieldBonus: once a term has been searched enough to mean something
 *   (>=3 attributed candidates), its real historical opportunities-per-
 *   candidate rate feeds back in, capped at 40 — high-yield terms surface
 *   more, low-yield ones fade, without ever fully zeroing out.
 */
export function rankTerms(terms: DiscoveryTerm[]): RankedTerm[] {
  const now = Date.now();
  return terms
    .filter((t) => t.term.trim().length > 0)
    .map((t) => {
      const base = PRIORITY_BASE[t.priority] ?? 10;

      let explorationBonus = 0;
      if (t.timesUsed === 0) {
        explorationBonus = 50;
      } else if (t.lastUsedAt) {
        const daysIdle = (now - t.lastUsedAt.getTime()) / 86_400_000;
        explorationBonus = Math.min(30, daysIdle * 5);
      }

      let yieldBonus = 0;
      if (t.candidatesFound >= 3) {
        yieldBonus = Math.min(40, (t.opportunitiesFound / t.candidatesFound) * 200);
      }

      return { term: t, score: base + explorationBonus + yieldBonus };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Best-effort attribution: which specific term(s) in this batch's OR query
 * actually appear in the returned post's own text. Falls back to crediting
 * every term in the batch when none literally match — Redditapis's own
 * relevance search isn't a literal substring match either, so "we can't
 * isolate which term caused this hit" is an honest outcome, not a bug.
 */
export function matchedTermIds(post: RedditapisPost, batchTerms: TermRef[]): string[] {
  const text = `${post.title ?? ""} ${post.text ?? ""}`.toLowerCase();
  const matched = batchTerms.filter((t) => text.includes(t.term.toLowerCase())).map((t) => t.id);
  return matched.length > 0 ? matched : batchTerms.map((t) => t.id);
}

// How many of the campaign's ranked discovery terms get a chance to run
// this scan. Not the same as provider-call count — see packTermBatches,
// which bundles many terms into few calls.
const DISCOVERY_TERMS_PER_SCAN = Number(process.env.DISCOVERY_TERMS_PER_SCAN) || 60;
// Hard cap on discovery-layer provider calls per scan, independent of pool
// size or DISCOVERY_TERMS_PER_SCAN — this is the actual cost lever, not
// DISCOVERY_BATCH_FETCH_LIMIT below (Redditapis charges a flat $0.002 per
// request regardless of `limit`, verified live against the real API — so
// call COUNT drives cost, not result count per call). At $0.002/call, 8
// batches is $0.016/scan for the discovery layer.
const MAX_DISCOVERY_BATCHES_PER_SCAN = Number(process.env.MAX_DISCOVERY_BATCHES_PER_SCAN) || 8;
// Redditapis hard-rejects any value above 100 with a 400 (verified live:
// 100 succeeds, 250/500/1000 all fail with "limit must be an integer
// between 1 and 100") — so 100 isn't an arbitrary raise, it's the actual
// ceiling. Since cost is flat per-request, requesting fewer than the max
// the provider allows is pure recall left on the table for free.
const DISCOVERY_BATCH_FETCH_LIMIT = Number(process.env.DISCOVERY_BATCH_FETCH_LIMIT) || 100;
// Deliberately independent from ANALYSIS_CONCURRENCY (lib/pipeline.ts) —
// search concurrency and AI concurrency are bounded by completely different
// constraints (provider stampede risk + shared budget-check races here, vs.
// Gemini throughput + serverless timeout there) and must not be tied
// together. Raised slightly alongside the higher job count above (up to
// ~10 jobs/scan now vs ~5 before) to keep total search-phase wall time
// roughly where it was; still modest — a handful of calls a few seconds
// apart is plenty, and low concurrency keeps the shared budget check
// honest against races.
const SEARCH_CONCURRENCY = Number(process.env.SEARCH_CONCURRENCY) || 3;
// Bounded, cost-cheap precision boost for campaigns with several
// configured communities. A global (unscoped) search already surfaces
// content from every subreddit Redditapis indexes, including any the
// campaign lists — restricting to a specific subreddit doesn't add reach
// a provider that requires per-subreddit crawling would need, it only
// narrows relevance ranking toward a known-good community. So the main
// precision/discovery batches stay global (maximum recall); this adds a
// SMALL number of extra subreddit-scoped calls using the best available
// query, rotating through the campaign's communities day-to-day
// (deterministic, not random — see buildCommunityBonusJobs) rather than
// looping over all of them every scan.
const MAX_COMMUNITY_BONUS_BATCHES = Number(process.env.MAX_COMMUNITY_BONUS_BATCHES) || 2;
// Extra pages for the precision query specifically (verified live: the
// `after` cursor returns a genuinely disjoint page, not a re-rank — see
// the pagination note in runDiscovery). Defaults to 1 (no pagination,
// unchanged behavior) deliberately: Redditapis is cheap per call, but this
// deployment's actual account balance is small (a few hundred read calls
// total), so "capability exists, default stays conservative" is the
// correct posture — raise via env var on an account funded for the volume
// you actually want. Capped at 5 so a misconfiguration can't quietly
// multiply every scan's precision-layer cost by an unbounded amount.
const PRECISION_QUERY_PAGES = Math.min(5, Math.max(1, Number(process.env.PRECISION_QUERY_PAGES) || 1));

export type DiscoveryParams = {
  campaignId: string;
  companyId?: string;
  keywords: string[];
  topics: string[];
  /**
   * Full list of the campaign's configured communities. 0 = fully global
   * search (no subreddit restriction on anything). 1 = that subreddit
   * scopes every job this scan (an explicit, deliberate choice by whoever
   * configured the campaign — preserved as-is). 2+ = main batches stay
   * global for maximum recall, plus a small number of rotating
   * community-scoped bonus batches — see MAX_COMMUNITY_BONUS_BATCHES.
   */
  communities: string[];
  sort: "new";
  t: "hour" | "day" | "week" | "month" | "year" | "all";
  /** Fetch limit for the precision query specifically — the caller-configured "one big call" limit. Discovery batches use their own smaller DISCOVERY_BATCH_FETCH_LIMIT regardless. */
  baselineLimit: number;
  /** Only used here to compute per-batch keptCount for DiscoveryTermRun rows — the real recency filter that actually governs what reaches ingestion still lives in redditApisAdapter.ts, applied once to the final deduped set. */
  maxAgeHours: number;
  /** ScanRun to attach DiscoveryTermRun history to — optional so a caller not tracking scan-level metrics doesn't need to create one first. */
  scanRunId?: string;
};

export type DiscoveredPost = { post: RedditapisPost; foundBy: string[] };

export type DiscoveryResult = {
  posts: DiscoveredPost[];
  batchesRun: { kind: "precision" | "discovery" | "community"; termCount: number; query: string; rawCount: number; subreddit?: string }[];
  discoveryTermsUsed: number;
  /** Full job list built before execution — the honest "intended to run this many searches" number, independent of how many actually executed. */
  searchesPlanned: number;
  /** Jobs that never even got attempted because the provider budget was already exhausted by the time their turn came — see the mid-scan RedditapisBudgetExceededError short-circuit below. */
  searchesSkippedBudget: number;
  errors: string[];
};

/**
 * Deterministic (day-indexed, not random) rotation through a campaign's
 * configured communities for the bounded subreddit-scoped bonus batches —
 * reproducible and debuggable (same day -> same rotation), rotates day to
 * day so coverage spreads across all configured communities over time
 * instead of always hitting the same one or two. Pure function: no I/O, no
 * campaign lookups, easy to unit test independent of a live scan.
 */
export function buildCommunityBonusJobs(
  communities: string[],
  bestQuery: string,
  maxBonusBatches: number,
  now: number,
): { subreddit: string; query: string }[] {
  if (communities.length < 2 || !bestQuery || maxBonusBatches <= 0) return [];
  const ordered = [...new Set(communities.filter((c) => c.trim().length > 0))].sort();
  if (ordered.length < 2) return [];
  const dayIndex = Math.floor(now / 86_400_000);
  const count = Math.min(maxBonusBatches, ordered.length);
  return Array.from({ length: count }, (_, i) => ({
    subreddit: ordered[(dayIndex + i) % ordered.length]!,
    query: bestQuery,
  }));
}

async function regenerateDiscoveryTerms(campaignId: string, offer: Offer): Promise<void> {
  const generated = await generateDiscoveryTerms(offer);
  const hash = hashOfferForDiscovery(offer);
  await prisma.$transaction([
    prisma.discoveryTerm.updateMany({ where: { campaignId, active: true }, data: { active: false } }),
    prisma.discoveryTerm.createMany({
      data: generated.terms.map((t) => ({
        campaignId,
        term: t.term,
        category: t.category,
        priority: t.priority,
        promptVersion: DISCOVERY_PROMPT_VERSION,
      })),
    }),
    prisma.campaign.update({ where: { id: campaignId }, data: { discoveryOfferHash: hash } }),
  ]);
}

/**
 * Bootstraps or refreshes a campaign's discovery-term pool. Regeneration
 * happens when: the campaign has no active terms yet (first-ever scan), the
 * live offer's fingerprint no longer matches the one the current pool was
 * generated from (a material business change — see hashOfferForDiscovery),
 * or the current pool predates this deployment's DISCOVERY_PROMPT_VERSION.
 * NOT regenerated on every scan otherwise — Gemini generation is a real
 * cost, not something to pay repeatedly for an unchanged business.
 *
 * Called from two places: lazily, inside runDiscovery(), so a scan never
 * runs against a stale/missing pool; and eagerly, right after
 * completeOnboardingAction creates a campaign+offer (via Next's after()),
 * so the discovery profile is already populated by the time a brand-new
 * user reaches the campaign page — for both the website and no-website
 * onboarding path equally, since both only ever produce the same Offer
 * row this function reads.
 */
export async function ensureDiscoveryTerms(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { company: { include: { offer: true } } },
  });
  const offer = campaign?.company.offer;
  if (!campaign || !offer) return; // no offer yet — precision query still works fine on its own

  const activeCount = await prisma.discoveryTerm.count({ where: { campaignId, active: true } });
  const currentHash = hashOfferForDiscovery(offer);
  const hashStale = campaign.discoveryOfferHash !== currentHash;

  let versionStale = false;
  if (activeCount > 0 && !hashStale) {
    const sample = await prisma.discoveryTerm.findFirst({ where: { campaignId, active: true } });
    versionStale = sample?.promptVersion !== DISCOVERY_PROMPT_VERSION;
  }

  if (activeCount > 0 && !hashStale && !versionStale) return;

  try {
    await regenerateDiscoveryTerms(campaignId, offer);
  } catch (err) {
    // Generation failure (e.g. Gemini not configured) should never break a
    // scan — the precision query still works on its own. Log for whoever
    // operates this deployment, not the customer.
    console.error(`[searchOrchestrator] discovery term generation failed for campaign ${campaignId}:`, err);
  }
}

/** Manual "regenerate" trigger (campaign page action) — same path as automatic staleness detection, forced regardless. */
export async function forceRegenerateDiscoveryTerms(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { company: { include: { offer: true } } },
  });
  const offer = campaign?.company.offer;
  if (!offer) throw new Error("No offer profile found for this company yet — finish onboarding first.");
  await regenerateDiscoveryTerms(campaignId, offer);
}

/**
 * Runs the campaign's precision query plus a rotated, budget-respecting
 * batch of discovery-term queries, all through
 * lib/providers/redditapis/service.ts (cache -> budget -> network -> ledger
 * preserved for every single call). Deduplicates by source id before
 * returning — a post found by several batches becomes one entry with every
 * matching term credited in `foundBy`. Individual query failures (including
 * budget exhaustion partway through) are recorded in `errors` and do not
 * abort the rest of the scan.
 */
export async function runDiscovery(params: DiscoveryParams): Promise<DiscoveryResult> {
  await ensureDiscoveryTerms(params.campaignId);

  const precisionQuery = buildBaselineQuery(params.keywords, params.topics);
  const termRows = await prisma.discoveryTerm.findMany({ where: { campaignId: params.campaignId, active: true } });
  const ranked = rankTerms(termRows).slice(0, DISCOVERY_TERMS_PER_SCAN);
  const batches = packTermBatches(
    ranked.map((r) => ({ id: r.term.id, term: r.term.term })),
    MAX_DISCOVERY_BATCHES_PER_SCAN,
    MAX_PHRASE_GROUP_LENGTH,
  );

  // Exactly one configured community scopes everything (unchanged, explicit
  // choice). Zero or many communities: main batches go global — see
  // MAX_COMMUNITY_BONUS_BATCHES's comment for why that's correct for
  // recall, not a coverage loss.
  const singleCommunity = params.communities.length === 1 ? params.communities[0] : undefined;

  type Job = { kind: "precision" | "discovery" | "community"; termIds: string[]; termTexts: string[]; query: string; limit: number; subreddit?: string };
  const jobs: Job[] = [];
  if (precisionQuery) jobs.push({ kind: "precision", termIds: [], termTexts: [], query: precisionQuery, limit: Math.min(params.baselineLimit, 100), subreddit: singleCommunity });
  for (const b of batches) jobs.push({ kind: "discovery", termIds: b.termIds, termTexts: b.termTexts, query: b.query, limit: DISCOVERY_BATCH_FETCH_LIMIT, subreddit: singleCommunity });

  const bestQueryForCommunityBonus = precisionQuery || batches[0]?.query || "";
  const bonusJobs = buildCommunityBonusJobs(params.communities, bestQueryForCommunityBonus, MAX_COMMUNITY_BONUS_BATCHES, Date.now());
  for (const b of bonusJobs) {
    jobs.push({ kind: "community", termIds: [], termTexts: [], query: b.query, limit: DISCOVERY_BATCH_FETCH_LIMIT, subreddit: b.subreddit });
  }

  const searchesPlanned = jobs.length;

  const byId = new Map<string, DiscoveredPost>();
  const batchesRun: DiscoveryResult["batchesRun"] = [];
  const errors: string[] = [];
  const termHitCounts = new Map<string, number>(); // termId -> candidates attributed this scan
  const succeededTermIds = new Set<string>(); // terms whose batch actually executed — the only ones whose rotation stats get touched
  const runRows: {
    termIds: string;
    kind: "precision" | "discovery" | "community";
    query: string;
    rawCount: number;
    keptCount: number;
    cacheHit: boolean;
    success: boolean;
    errorMessage: string | null;
  }[] = [];

  let budgetExhausted = false;
  let searchesSkippedBudget = 0;
  const context = { campaignId: params.campaignId, companyId: params.companyId };
  const cutoffMs = Date.now() - params.maxAgeHours * 60 * 60 * 1000;

  await mapWithConcurrency(jobs, SEARCH_CONCURRENCY, async (job) => {
    if (budgetExhausted) {
      // Recorded honestly, not silently dropped — a scan that planned 10
      // searches and got budget-cut after 6 must not look identical (same
      // providerCalls) to a scan that only ever needed 6. See ScanRun's
      // searchesPlanned/searchesSkippedBudget fields.
      searchesSkippedBudget += 1;
      runRows.push({
        termIds: JSON.stringify(job.termIds),
        kind: job.kind,
        query: job.query,
        rawCount: 0,
        keptCount: 0,
        cacheHit: false,
        success: false,
        errorMessage: "skipped: provider budget exhausted before this job's turn",
      });
      return;
    }
    try {
      // recordPage merges one page's results into the shared dedup map and
      // writes its own DiscoveryTermRun row — factored out so pagination
      // (below, precision job only) can call it again for page 2+ without
      // duplicating the merge/keptCount/cache-hit-lookup/runRow logic.
      const recordPage = async (response: Awaited<ReturnType<typeof redditapis.searchRedditapis>>) => {
        const batchTermRefs: TermRef[] = job.termIds.map((id, i) => ({ id, term: job.termTexts[i]! }));
        let keptCount = 0;
        for (const post of response.posts) {
          if (post.created_utc * 1000 >= cutoffMs) keptCount += 1;
          const id = post.name || post.id;
          const labels = job.kind === "precision" ? ["precision"] : matchedTermIds(post, batchTermRefs);
          if (job.kind === "discovery") {
            for (const l of labels) termHitCounts.set(l, (termHitCounts.get(l) ?? 0) + 1);
          }
          const existing = byId.get(id);
          if (existing) {
            for (const l of labels) if (!existing.foundBy.includes(l)) existing.foundBy.push(l);
          } else {
            byId.set(id, { post, foundBy: [...labels] });
          }
        }

        // Best-effort cache-hit lookup — reads back the ledger row this exact
        // call just wrote (lib/providers/redditapis/service.ts), the same
        // pattern lib/pipeline.ts already uses for its own cacheHit field.
        // Deliberately doesn't touch service.ts's own write path, so this
        // observability addition carries zero risk to budget/ledger
        // correctness — worst case here is a mis-attributed cacheHit flag on
        // a metrics row, never a wrong charge.
        let cacheHit = false;
        try {
          const lastUsage = await prisma.providerUsageEvent.findFirst({
            where: { campaignId: params.campaignId },
            orderBy: { createdAt: "desc" },
          });
          cacheHit = lastUsage?.cacheHit ?? false;
        } catch {
          // metrics-only lookup — never worth failing the scan over
        }

        runRows.push({
          termIds: JSON.stringify(job.termIds),
          kind: job.kind,
          query: job.query,
          rawCount: response.posts.length,
          keptCount,
          cacheHit,
          success: true,
          errorMessage: null,
        });
        return response;
      };

      const response = await redditapis.searchRedditapis(
        { q: job.query, subreddit: job.subreddit, sort: params.sort, t: params.t, limit: job.limit },
        context,
      );
      batchesRun.push({ kind: job.kind, termCount: job.termIds.length, query: job.query, rawCount: response.posts.length, subreddit: job.subreddit });
      job.termIds.forEach((id) => succeededTermIds.add(id));
      await recordPage(response);

      // Pagination — precision job only (the campaign's own curated,
      // highest-signal query), off by default (PRECISION_QUERY_PAGES=1).
      // Real page-2 mechanics verified live: the `after` cursor returns a
      // genuinely disjoint page (zero overlap with page 1), not a re-rank —
      // so this is real additional recall, not wasted spend, when a real
      // page came back full (rawCount === limit, meaning more likely
      // exists). Each page is its own real $0.002 call through the exact
      // same searchRedditapis() -> service.ts path as everything else, so
      // budget/cache/ledger stay fully in force per page — a mid-pagination
      // budget exhaustion just stops the loop, it doesn't throw past it.
      if (job.kind === "precision" && PRECISION_QUERY_PAGES > 1 && response.posts.length >= job.limit) {
        let after = response.after ?? undefined;
        for (let page = 1; page < PRECISION_QUERY_PAGES && after; page++) {
          try {
            const nextResponse = await redditapis.searchRedditapis(
              { q: job.query, subreddit: job.subreddit, sort: params.sort, t: params.t, limit: job.limit, after },
              context,
            );
            await recordPage(nextResponse);
            if (nextResponse.posts.length < job.limit) break; // short page — provider has nothing further
            after = nextResponse.after ?? undefined;
          } catch (err) {
            if (err instanceof RedditapisBudgetExceededError) budgetExhausted = true;
            console.error(`[searchOrchestrator] precision pagination page ${page + 1} failed for campaign ${params.campaignId}:`, err);
            break; // stop paginating, keep whatever pages already succeeded
          }
        }
      }
    } catch (err) {
      if (err instanceof RedditapisBudgetExceededError) budgetExhausted = true;
      const message = err instanceof Error ? err.message : "Unknown error.";
      console.error(`[searchOrchestrator] ${job.kind} batch failed for campaign ${params.campaignId}:`, err);
      errors.push(`${job.kind}: ${message}`);
      runRows.push({
        termIds: JSON.stringify(job.termIds),
        kind: job.kind,
        query: job.query,
        rawCount: 0,
        keptCount: 0,
        cacheHit: false,
        success: false,
        errorMessage: message,
      });
    }
  });

  if (params.scanRunId && runRows.length > 0) {
    try {
      await prisma.discoveryTermRun.createMany({
        data: runRows.map((r) => ({ scanRunId: params.scanRunId!, ...r })),
      });
    } catch (err) {
      console.error(`[searchOrchestrator] failed to persist DiscoveryTermRun rows for campaign ${params.campaignId}:`, err);
    }
  }

  // Stats update — only for terms whose batch actually executed. A term
  // that was skipped (e.g. budget ran out before its batch's turn) never
  // really "ran" — bumping timesUsed/lastUsedAt for it anyway would
  // incorrectly suppress its rotation priority next scan for something
  // that was never its fault. Best-effort either way; never blocks
  // returning results to the scan.
  const usedTermIds = Array.from(succeededTermIds);
  if (usedTermIds.length > 0) {
    try {
      await Promise.all(
        usedTermIds.map((id) =>
          prisma.discoveryTerm.update({
            where: { id },
            data: {
              timesUsed: { increment: 1 },
              lastUsedAt: new Date(),
              candidatesFound: { increment: termHitCounts.get(id) ?? 0 },
            },
          }),
        ),
      );
    } catch (err) {
      console.error(`[searchOrchestrator] discovery term stats update failed for campaign ${params.campaignId}:`, err);
    }
  }

  return {
    posts: Array.from(byId.values()),
    batchesRun,
    discoveryTermsUsed: usedTermIds.length,
    searchesPlanned,
    searchesSkippedBudget,
    errors,
  };
}

/** Credits a genuine opportunity back to every term that found it — the exploitation half of rotation. Called from pipeline.ts once analysis confirms is_opportunity. */
export async function creditOpportunityToTerms(ids: string[]): Promise<void> {
  const realIds = ids.filter((id) => id !== "precision");
  if (realIds.length === 0) return;
  try {
    await prisma.discoveryTerm.updateMany({
      where: { id: { in: realIds } },
      data: { opportunitiesFound: { increment: 1 } },
    });
  } catch (err) {
    console.error("[searchOrchestrator] failed to credit opportunity to discovery terms:", err);
  }
}
