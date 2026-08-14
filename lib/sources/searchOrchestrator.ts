import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/concurrency";
import * as redditapis from "@/lib/providers/redditapis/service";
import { RedditapisBudgetExceededError, type RedditapisPost } from "@/lib/providers/redditapis/service";
import { generateSearchSurfaces } from "@/lib/ai/searchSurfaces";
import { SEARCH_SURFACE_FAMILIES } from "@/lib/ai/schemas";
import type { SearchSurface } from "@prisma/client";

/**
 * Retrieval architecture: broad discovery -> semantic qualification.
 *
 * This module owns every discovery ANGLE (query family, phrase set,
 * rotation, priority) for Reddit retrieval. lib/sources/redditApisAdapter.ts
 * stays a thin execution/normalization layer that calls runDiscovery() and
 * turns whatever it returns into NormalizedConversation[] — it does not
 * construct query strings itself anymore. lib/providers/redditapis/service.ts
 * remains the ONLY thing that ever calls the Redditapis client — every query
 * this module runs goes through searchRedditapis(), so cache -> budget ->
 * network -> ledger is preserved exactly as before, just called more than
 * once per scan now instead of exactly once.
 *
 * One query — the "baseline" — is not part of the rotation pool: it's the
 * campaign's existing keyword/topic query (topic terms AND'd with generic
 * intent words, OR'd against the campaign's own exact keyword phrases),
 * unchanged from before this file existed, and it always runs. Everything
 * else here is ADDITIVE — new discovery angles rotated in alongside it, not
 * a replacement for what was already verified to work.
 */

// Generic, vertical-agnostic buying-intent vocabulary — see
// redditApisAdapter.ts's prior version of this comment for the live-verified
// reasoning (0 vs 100 matches). Only domain_topic phrases get ANDed with
// this; every other family's phrases already carry their own intent signal
// in how they were generated (see lib/ai/searchSurfaces.ts), so ANDing them
// again would just over-narrow a query that doesn't need it.
const INTENT_WORDS = ["looking", "need", "recommend", "recommendation", "recommendations", "suggest", "suggestions", "advice", "hire", "considering", "want", "worth"];

const MAX_PHRASE_GROUP_LENGTH = 400;

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

/** The campaign's always-on query — unchanged behavior from before this module existed. */
export function buildBaselineQuery(keywords: string[], topics: string[]): string {
  const topicGroup = buildPhraseGroup(topics, MAX_PHRASE_GROUP_LENGTH);
  const broad = topicGroup ? `(${topicGroup}) AND (${INTENT_WORDS.join(" OR ")})` : "";
  const precise = buildPhraseGroup(keywords, MAX_PHRASE_GROUP_LENGTH);
  if (broad && precise) return `(${broad}) OR (${precise})`;
  return broad || precise;
}

function buildSurfaceQuery(family: string, phrases: string[]): string {
  const group = buildPhraseGroup(phrases, MAX_PHRASE_GROUP_LENGTH);
  if (!group) return "";
  if (family === "domain_topic") return `(${group}) AND (${INTENT_WORDS.join(" OR ")})`;
  return group;
}

/**
 * Explainable base priority per family — the ranking spec calls for
 * (high-likelihood buyer requests first, experimental/long-tail last),
 * expressed as numbers so exploration/yield bonuses can be added on top
 * without needing separate tie-break logic. Not tuned from data; tuned
 * from the stated reasoning order. `local` starts in the long-tail tier
 * and gets promoted into the "problem" tier at selection time if the
 * business actually has a geography constraint (see rankSurfaces) —
 * geography is a real signal for a local business, a guess for a remote one.
 */
const BASE_PRIORITY: Record<string, number> = {
  buyer_request: 90,
  provider_search: 80,
  recommendation: 70,
  problem: 60,
  comparison: 50,
  alternative: 50,
  solution: 40,
  goal: 30,
  domain_topic: 20,
  troubleshooting: 10,
  dissatisfaction: 10,
  urgency: 10,
  beginner_confusion: 10,
  planning: 10,
  local: 10,
};

type RankedSurface = { surface: SearchSurface; phrases: string[]; score: number };

/**
 * Exploration + exploitation, not "repeat the same queries forever":
 * - base: the family's static priority tier (see BASE_PRIORITY above).
 * - explorationBonus: surfaces that have never run get a strong flat boost
 *   (every family eventually gets tried at least once); surfaces that HAVE
 *   run get a smaller bonus that grows the longer it's been since they last
 *   ran, capped at 30 after ~6 days idle, so rotation actually rotates.
 * - yieldBonus: once a surface has run enough to mean something (>=3 raw
 *   hits recorded), its real historical opportunities-per-hit rate feeds
 *   back in, capped at 40 — high-yield surfaces get run more, low-yield
 *   ones fade, without ever fully zeroing out (base+exploration keep even a
 *   0-yield surface eligible again eventually).
 */
function rankSurfaces(surfaces: SearchSurface[], hasGeography: boolean): RankedSurface[] {
  const now = Date.now();
  return surfaces
    .map((s) => {
      let phrases: string[] = [];
      try {
        phrases = JSON.parse(s.phrases);
      } catch {
        phrases = [];
      }
      return { surface: s, phrases };
    })
    .filter((s) => s.phrases.length > 0)
    .map(({ surface, phrases }) => {
      let base = BASE_PRIORITY[surface.family] ?? 10;
      if (surface.family === "local" && hasGeography) base = BASE_PRIORITY.problem!;

      let explorationBonus = 0;
      if (surface.timesRun === 0) {
        explorationBonus = 50;
      } else if (surface.lastRunAt) {
        const daysIdle = (now - surface.lastRunAt.getTime()) / 86_400_000;
        explorationBonus = Math.min(30, daysIdle * 5);
      }

      let yieldBonus = 0;
      if (surface.conversationsFound >= 3) {
        yieldBonus = Math.min(40, (surface.opportunitiesFound / surface.conversationsFound) * 200);
      }

      return { surface, phrases, score: base + explorationBonus + yieldBonus };
    })
    .sort((a, b) => b.score - a.score);
}

const MAX_ADDITIONAL_SURFACES_PER_SCAN = 4;
// Smaller than the old single-query limit (100) on purpose — with several
// queries running per scan instead of one, each can request less while
// total useful volume still goes up. Keeps the raw-post ceiling, and
// therefore downstream Gemini analysis volume, bounded for the serverless
// function's execution window.
const SURFACE_FETCH_LIMIT = 25;
// Modest on purpose (section 22: avoid provider stampedes) — a handful of
// calls a few seconds apart is plenty; high concurrency here buys nothing
// since each call is already fast, and low concurrency keeps the shared
// budget check honest against races.
const SURFACE_QUERY_CONCURRENCY = 2;

export type DiscoveryParams = {
  campaignId: string;
  companyId?: string;
  keywords: string[];
  topics: string[];
  subreddit?: string;
  sort: "new";
  t: "hour" | "day" | "week" | "month" | "year" | "all";
  hasGeography: boolean;
  /** Fetch limit for the baseline query specifically — the caller-configured "one big call" limit, unchanged in meaning from before this module existed. Rotated surfaces use their own smaller SURFACE_FETCH_LIMIT regardless, since they're a new addition the caller never configured. */
  baselineLimit: number;
};

export type DiscoveredPost = { post: RedditapisPost; foundBy: string[] };

export type DiscoveryResult = {
  posts: DiscoveredPost[];
  surfacesRun: { family: string; query: string; rawCount: number }[];
  errors: string[];
};

/** Bootstraps a campaign's rotation pool the first time it has none. Not regenerated on every scan — see lib/ai/searchSurfaces.ts. */
async function ensureSearchSurfaces(campaignId: string): Promise<void> {
  const existingCount = await prisma.searchSurface.count({ where: { campaignId } });
  if (existingCount > 0) return;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { company: { include: { offer: true } } },
  });
  const offer = campaign?.company.offer;
  if (!offer) return; // no offer yet — nothing to generate from; baseline query still runs fine on its own

  try {
    const generated = await generateSearchSurfaces(offer);
    await prisma.searchSurface.createMany({
      data: generated.surfaces.map((s) => ({
        campaignId,
        family: s.family,
        phrases: JSON.stringify(s.phrases),
      })),
    });
  } catch (err) {
    // Bootstrap failure (e.g. Gemini not configured) should never break a
    // scan — the baseline query still works on its own. Log for whoever
    // operates this deployment, not the customer.
    console.error(`[searchOrchestrator] surface generation failed for campaign ${campaignId}:`, err);
  }
}

/**
 * Runs the campaign's baseline query plus a rotated, budget-respecting
 * batch of additional discovery-angle queries, all through
 * lib/providers/redditapis/service.ts (cache -> budget -> network -> ledger
 * preserved for every single call). Deduplicates by source id before
 * returning — a post found by five queries becomes one entry with all five
 * surfaces credited in `foundBy`. Individual query failures (including
 * budget exhaustion partway through the batch) are recorded in `errors` and
 * do not abort the rest of the scan.
 */
export async function runDiscovery(params: DiscoveryParams): Promise<DiscoveryResult> {
  await ensureSearchSurfaces(params.campaignId);

  const surfaceRows = await prisma.searchSurface.findMany({ where: { campaignId: params.campaignId } });
  const ranked = rankSurfaces(surfaceRows, params.hasGeography).slice(0, MAX_ADDITIONAL_SURFACES_PER_SCAN);

  const baselineQuery = buildBaselineQuery(params.keywords, params.topics);
  const jobs: { family: string; surfaceId: string | null; query: string; limit: number }[] = [];
  if (baselineQuery) jobs.push({ family: "baseline", surfaceId: null, query: baselineQuery, limit: Math.min(params.baselineLimit, 100) });
  for (const r of ranked) {
    const query = buildSurfaceQuery(r.surface.family, r.phrases);
    if (query) jobs.push({ family: r.surface.family, surfaceId: r.surface.id, query, limit: SURFACE_FETCH_LIMIT });
  }

  const byId = new Map<string, DiscoveredPost>();
  const surfacesRun: DiscoveryResult["surfacesRun"] = [];
  const errors: string[] = [];
  const surfaceRawCounts = new Map<string, number>(); // surfaceId -> raw hits, for stats
  const succeededSurfaceIds = new Set<string>(); // only surfaces that actually executed get their rotation stats touched

  let budgetExhausted = false;
  const context = { campaignId: params.campaignId, companyId: params.companyId };

  await mapWithConcurrency(jobs, SURFACE_QUERY_CONCURRENCY, async (job) => {
    if (budgetExhausted) return; // skip remaining queued jobs once we know further calls will just fail the same check
    try {
      const response = await redditapis.searchRedditapis(
        { q: job.query, subreddit: params.subreddit, sort: params.sort, t: params.t, limit: job.limit },
        context,
      );
      surfacesRun.push({ family: job.family, query: job.query, rawCount: response.posts.length });
      if (job.surfaceId) {
        surfaceRawCounts.set(job.surfaceId, response.posts.length);
        succeededSurfaceIds.add(job.surfaceId);
      }

      for (const post of response.posts) {
        const id = post.name || post.id;
        const label = job.surfaceId ?? "baseline";
        const existing = byId.get(id);
        if (existing) {
          if (!existing.foundBy.includes(label)) existing.foundBy.push(label);
        } else {
          byId.set(id, { post, foundBy: [label] });
        }
      }
    } catch (err) {
      if (err instanceof RedditapisBudgetExceededError) budgetExhausted = true;
      const message = err instanceof Error ? err.message : "Unknown error.";
      console.error(`[searchOrchestrator] surface "${job.family}" failed for campaign ${params.campaignId}:`, err);
      errors.push(`${job.family}: ${message}`);
    }
  });

  // Stats update — only for surfaces whose query actually executed. A
  // surface that failed or got skipped (e.g. budget ran out before its
  // turn) never really "ran" — bumping timesRun/lastRunAt for it anyway
  // would incorrectly suppress its rotation priority next scan for
  // something that was never its fault. Best-effort either way; never
  // blocks returning results to the scan.
  const surfacesToUpdate = ranked.filter((r) => succeededSurfaceIds.has(r.surface.id));
  if (surfacesToUpdate.length > 0) {
    try {
      await Promise.all(
        surfacesToUpdate.map((r) =>
          prisma.searchSurface.update({
            where: { id: r.surface.id },
            data: {
              timesRun: { increment: 1 },
              lastRunAt: new Date(),
              conversationsFound: { increment: surfaceRawCounts.get(r.surface.id) ?? 0 },
            },
          }),
        ),
      );
    } catch (err) {
      console.error(`[searchOrchestrator] surface stats update failed for campaign ${params.campaignId}:`, err);
    }
  }

  return { posts: Array.from(byId.values()), surfacesRun, errors };
}

/** Credits a genuine opportunity back to every surface that found it — the exploitation half of rotation. Called from pipeline.ts once analysis confirms is_opportunity. */
export async function creditOpportunityToSurfaces(surfaceIds: string[]): Promise<void> {
  const realIds = surfaceIds.filter((id) => id !== "baseline");
  if (realIds.length === 0) return;
  try {
    await prisma.searchSurface.updateMany({
      where: { id: { in: realIds } },
      data: { opportunitiesFound: { increment: 1 } },
    });
  } catch (err) {
    console.error("[searchOrchestrator] failed to credit opportunity to surfaces:", err);
  }
}

export { SEARCH_SURFACE_FAMILIES };
