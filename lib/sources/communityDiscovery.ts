import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/concurrency";
import * as redditapis from "@/lib/providers/redditapis/service";
import { generateCommunityCandidates, COMMUNITY_DISCOVERY_PROMPT_VERSION } from "@/lib/ai/communityDiscovery";
import { hashOfferForDiscovery } from "@/lib/ai/discovery";
import type { Offer } from "@prisma/client";

/**
 * Intelligent Retrieval Assistance (spec: "IntentScout — Intelligent
 * Retrieval Assistance") — closes the exact gap the production audit
 * found: a business with zero manually-configured Reddit communities got
 * zero community-scoped retrieval. This module generates, validates,
 * scores, and tracks AI-suggested candidate subreddits per campaign, and
 * plugs the resulting ACTIVE ones into the existing community-bonus
 * rotation (lib/sources/searchOrchestrator.ts's buildCommunityBonusJobs)
 * exactly the same way a manually-configured Keyword(type: "subreddit")
 * already does — that function is untouched, and neither is
 * MAX_COMMUNITY_BONUS_BATCHES, the single existing limit that governs how
 * many community-scoped provider calls one scan can spend, manual or
 * AI-suggested alike.
 *
 * ARCHITECTURE
 *   Offer -> generateCommunityCandidates() (lib/ai/communityDiscovery.ts)
 *     -> validateSubreddit() against the existing Redditapis provider
 *        (budgeted/cached/ledgered exactly like every other call)
 *     -> CommunityCandidate rows: valid+high priority auto-activate,
 *        valid+medium/low need customer approval, invalid are kept (for
 *        visibility) but never rotated
 *     -> searchOrchestrator.ts unions active candidate names into the
 *        SAME communities array buildCommunityBonusJobs already rotates
 *
 * Regeneration is ADDITIVE-ONLY, unlike DiscoveryTerm/XDiscoveryPhrase's
 * "deactivate all, recreate" pattern: a customer's approve/reject decision
 * and a community's accumulated yield stats must never be silently reset
 * by a later offer edit. ensureCommunityCandidates only ever INSERTS names
 * that don't already exist for the campaign.
 */

// Real, plausible subreddit names only — cheap guard against an obviously
// malformed AI suggestion before it ever spends a validation call.
const SUBREDDIT_NAME_PATTERN = /^[A-Za-z0-9_]{2,21}$/;

// How many raw AI suggestions get validated (a real, budgeted provider
// call each) per generation event — the actual cost lever here, same role
// as MAX_DISCOVERY_BATCHES_PER_SCAN plays for discovery batches. Kept
// modest: this only runs once per campaign per material offer change, not
// every scan, but an unbounded validation pass on a 20-40 candidate pool
// would still be an unbounded cost surface without this cap.
const MAX_CANDIDATES_TO_VALIDATE = Number(process.env.MAX_COMMUNITY_CANDIDATES_TO_VALIDATE) || 15;
const VALIDATION_CONCURRENCY = 3;

// A candidate this confident, once verified to actually exist, needs no
// human approval before joining rotation — mirrors "recommended default:
// automatically use highly confident relevant communities" (spec section
// 5). medium/low candidates still get validated and stored (so the
// customer can review and approve them) but stay out of rotation until
// approved.
const AUTO_ACTIVATE_PRIORITY = "high";

// Adaptive retrieval (spec section 7), conservative and separate from the
// existing rankTerms/rankCandidates ranking algorithm — never rewritten
// here. A community that's actually run enough times to mean something
// and never once returned anything gets quietly taken out of rotation,
// the same spirit as DiscoveryTerm's yieldBonus rewarding real performers,
// just applied as a floor instead of a ranking weight (buildCommunityBonusJobs
// stays simple deterministic rotation, unmodified).
const AUTO_PAUSE_AFTER_USES = 5;

/** Pure shape check — no I/O — exported so it's directly unit-testable. The real existence check (validateSubreddit, below) still always runs; this is just the cheap pre-filter that avoids spending a provider call on an obviously malformed name. */
export function isPlausibleSubredditName(name: string): boolean {
  return SUBREDDIT_NAME_PATTERN.test(name);
}

async function validateSubreddit(name: string, context: { campaignId?: string; companyId?: string }): Promise<boolean> {
  if (!isPlausibleSubredditName(name)) return false;
  try {
    // Lightest possible real check against the existing provider: a
    // 1-post listing. Goes through the exact same cache -> budget ->
    // network -> ledger path as every other call in this codebase — no
    // second validation system, no raw client call.
    await redditapis.listSubredditPostsCached({ subreddit: name, limit: 1, sort: "new" }, context);
    return true;
  } catch {
    // Any failure (404/nonexistent, private, provider error) — reject.
    // Not distinguishing failure reasons here is deliberate: the only
    // question that matters is "can this be searched," and a transient
    // provider fault failing validation just means this candidate is
    // retried on the next material offer change, never silently ignored.
    return false;
  }
}

type GeneratedCandidate = { name: string; priority: string; reasoning: string; relatedConcepts: string[] };

/**
 * Pure — no I/O — so it's directly unit-testable without a live database
 * or Gemini call. Additive-only dedup (never re-suggest a name the
 * campaign already has an opinion about, manual or AI) plus a
 * priority-first ordering so a pool larger than the validation budget
 * spends its real provider calls on the most confident candidates first.
 */
export function selectCandidatesToValidate(
  generated: GeneratedCandidate[],
  alreadyKnownNames: string[],
  maxToValidate: number,
): GeneratedCandidate[] {
  const alreadyKnown = new Set(alreadyKnownNames.map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  const novel = generated.filter((c) => {
    const key = c.name.trim().toLowerCase();
    if (!key || alreadyKnown.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...novel].sort((a, b) => (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3)).slice(0, maxToValidate);
}

async function regenerateCommunityCandidates(campaignId: string, offer: Offer): Promise<void> {
  const generated = await generateCommunityCandidates(offer);
  const hash = hashOfferForDiscovery(offer);

  const [existingCandidates, manualSubreddits] = await Promise.all([
    prisma.communityCandidate.findMany({ where: { campaignId }, select: { name: true } }),
    prisma.keyword.findMany({ where: { campaignId, type: "subreddit" }, select: { term: true } }),
  ]);
  const alreadyKnownNames = [...existingCandidates.map((c) => c.name), ...manualSubreddits.map((k) => k.term)];

  // Additive-only: never touch a name the campaign already has an opinion
  // about (approved, rejected, manually configured) or has already
  // validated — see this file's own doc comment for why.
  const toValidate = selectCandidatesToValidate(generated.communities, alreadyKnownNames, MAX_CANDIDATES_TO_VALIDATE);

  const context = { campaignId };
  const rows: {
    campaignId: string;
    name: string;
    status: string;
    priority: string;
    reasoning: string;
    relatedConcepts: string;
    promptVersion: string;
    verifiedAt: Date | null;
  }[] = [];
  await mapWithConcurrency(toValidate, VALIDATION_CONCURRENCY, async (candidate) => {
    const valid = await validateSubreddit(candidate.name, context);
    const status = !valid ? "invalid" : candidate.priority === AUTO_ACTIVATE_PRIORITY ? "active" : "suggested";
    rows.push({
      campaignId,
      name: candidate.name,
      status,
      priority: candidate.priority,
      reasoning: candidate.reasoning,
      relatedConcepts: JSON.stringify(candidate.relatedConcepts),
      promptVersion: COMMUNITY_DISCOVERY_PROMPT_VERSION,
      verifiedAt: valid ? new Date() : null,
    });
  });

  if (rows.length > 0) {
    // skipDuplicates as a defensive backstop against the same name being
    // suggested twice in one generation (already deduped above) or a rare
    // race with a concurrent regeneration — never overwrites an existing row.
    await prisma.communityCandidate.createMany({ data: rows, skipDuplicates: true });
  }
  // Campaign.discoveryOfferHash is shared with DiscoveryTerm/XDiscoveryPhrase
  // staleness — only worth writing here if this is the first thing to set
  // it (both siblings already keep it current in the far more common case
  // where a Reddit or X campaign runs its own ensure* first). A community
  // candidate check on a campaign whose discovery pool hasn't been
  // generated yet (rare — only reachable if this function's caller runs
  // before ensureDiscoveryTerms/ensureXPhrases) still needs it recorded so
  // this function doesn't re-run pointlessly on every scan.
  await prisma.campaign.updateMany({ where: { id: campaignId, discoveryOfferHash: null }, data: { discoveryOfferHash: hash } });
}

/**
 * Bootstraps or tops up a campaign's AI-suggested community pool. Runs
 * when: the campaign has no CommunityCandidate rows yet, the live offer's
 * fingerprint no longer matches what was last checked, or existing rows
 * predate this deployment's COMMUNITY_DISCOVERY_PROMPT_VERSION. Unlike
 * ensureDiscoveryTerms/ensureXPhrases, "stale" never wipes anything here —
 * see regenerateCommunityCandidates's own doc comment. Called from the
 * same two trigger points as ensureDiscoveryTerms: onboarding's after()
 * callback, and lazily inside runDiscovery() so a scan on a campaign with
 * zero configured communities still gets a chance at AI-suggested ones
 * before its jobs are built.
 */
export async function ensureCommunityCandidates(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { company: { include: { offer: true } } },
  });
  const offer = campaign?.company.offer;
  if (!campaign || !offer) return;
  if (campaign.sourceType !== "reddit") return; // communities are a Reddit-only concept — see this file's own doc comment on X

  const existing = await prisma.communityCandidate.findMany({ where: { campaignId }, select: { promptVersion: true } });
  const currentHash = hashOfferForDiscovery(offer);
  const hashStale = campaign.discoveryOfferHash !== currentHash;
  const versionStale = existing.length > 0 && existing.some((c) => c.promptVersion !== COMMUNITY_DISCOVERY_PROMPT_VERSION);

  if (existing.length > 0 && !hashStale && !versionStale) return;

  try {
    await regenerateCommunityCandidates(campaignId, offer);
  } catch (err) {
    // Never breaks a scan — the campaign's manual communities (if any) and
    // global search still work fine on their own.
    console.error(`[communityDiscovery] candidate generation failed for campaign ${campaignId}:`, err);
  }
}

/** Manual "refresh suggestions" trigger (campaign page action) — same additive regeneration, forced regardless of staleness. */
export async function forceRegenerateCommunityCandidates(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { company: { include: { offer: true } } },
  });
  const offer = campaign?.company.offer;
  if (!offer) throw new Error("No offer profile found for this company yet — finish onboarding first.");
  await regenerateCommunityCandidates(campaignId, offer);
}

/**
 * Post-scan stats update for CommunityCandidate rows, mirroring
 * DiscoveryTerm's own timesUsed/candidatesFound update in
 * searchOrchestrator.ts — but a fully independent block, so this can never
 * affect that existing, already-tested logic. Reads batchesRun (already
 * computed by runDiscovery for its own logging), never re-queries the
 * provider. Includes the one piece of adaptive learning this feature adds:
 * a community that's run AUTO_PAUSE_AFTER_USES times with zero candidates
 * and zero opportunities gets taken out of rotation automatically.
 */
export async function updateCommunityStatsFromScan(
  campaignId: string,
  batchesRun: { kind: "precision" | "discovery" | "community"; rawCount: number; subreddit?: string }[],
): Promise<void> {
  const communityHits = batchesRun.filter((b) => b.kind === "community" && b.subreddit);
  if (communityHits.length === 0) return;

  try {
    const names = [...new Set(communityHits.map((b) => b.subreddit!))];
    const rawCountByName = new Map<string, number>();
    for (const b of communityHits) rawCountByName.set(b.subreddit!, (rawCountByName.get(b.subreddit!) ?? 0) + b.rawCount);

    const candidates = await prisma.communityCandidate.findMany({ where: { campaignId, name: { in: names } } });
    await Promise.all(
      candidates.map((c) => {
        const newTimesUsed = c.timesUsed + 1;
        const newCandidatesFound = c.candidatesFound + (rawCountByName.get(c.name) ?? 0);
        const shouldAutoPause = c.status === "active" && newTimesUsed >= AUTO_PAUSE_AFTER_USES && newCandidatesFound === 0 && c.opportunitiesFound === 0;
        return prisma.communityCandidate.update({
          where: { id: c.id },
          data: {
            timesUsed: { increment: 1 },
            lastUsedAt: new Date(),
            candidatesFound: { increment: rawCountByName.get(c.name) ?? 0 },
            ...(shouldAutoPause ? { status: "paused" } : {}),
          },
        });
      }),
    );
  } catch (err) {
    console.error(`[communityDiscovery] stats update failed for campaign ${campaignId}:`, err);
  }
}

/**
 * Credits a genuine opportunity to whichever CommunityCandidate its
 * conversation's community matches, if any — called from
 * lib/pipeline.ts's runAnalysisForConversation right after a real
 * Opportunity is created, mirroring the existing creditOpportunityToTerms
 * call already there. `community` is the Conversation.community value
 * ("r/foo" or null) already written by redditApisAdapter.ts at ingestion
 * time — no new attribution wiring needed.
 */
export async function creditCommunityOpportunity(campaignId: string, community: string | null): Promise<void> {
  if (!community?.startsWith("r/")) return;
  const name = community.slice(2);
  try {
    await prisma.communityCandidate.updateMany({
      where: { campaignId, name },
      data: { opportunitiesFound: { increment: 1 } },
    });
  } catch (err) {
    console.error(`[communityDiscovery] opportunity credit failed for campaign ${campaignId} / ${community}:`, err);
  }
}

async function ownedCandidate(campaignId: string, candidateId: string) {
  const candidate = await prisma.communityCandidate.findFirst({ where: { id: candidateId, campaignId } });
  if (!candidate) throw new Error("Community suggestion not found.");
  return candidate;
}

/** Customer approval — moves a "suggested" (or previously "paused"/"rejected") candidate into active rotation. */
export async function approveCommunityCandidate(campaignId: string, candidateId: string): Promise<void> {
  await ownedCandidate(campaignId, candidateId);
  await prisma.communityCandidate.update({ where: { id: candidateId }, data: { status: "active" } });
}

/** Customer rejection — removed from rotation, kept on record so it's never re-suggested (see regenerateCommunityCandidates's alreadyKnown dedup). */
export async function rejectCommunityCandidate(campaignId: string, candidateId: string): Promise<void> {
  await ownedCandidate(campaignId, candidateId);
  await prisma.communityCandidate.update({ where: { id: candidateId }, data: { status: "rejected" } });
}
