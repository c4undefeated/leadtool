import { prisma } from "@/lib/prisma";
import { getAdapter } from "@/lib/sources";
import type { NormalizedConversation } from "@/lib/sources/types";
import { analyzeConversation, ANALYSIS_PROMPT_VERSION } from "@/lib/ai/analysis";
import { ESTIMATED_GEMINI_COST_PER_ANALYSIS_USD } from "@/lib/ai/client";
import { priorityTierFromMatchScore } from "@/lib/ai/schemas";
import { mapWithConcurrency } from "@/lib/concurrency";
import { creditOpportunityToTerms } from "@/lib/sources/searchOrchestrator";
import { Prisma, type Offer } from "@prisma/client";

export { mapWithConcurrency };

export type IngestResult = {
  conversationsIngested: number;
  opportunitiesCreated: number;
  skippedDuplicates: number;
  skippedJunk: number;
  /** Whether the provider search itself was served from cache — null when no provider call happens (manual source, or the search failed before recording). */
  cacheHit: boolean | null;
  /**
   * true when a failure is structural (nothing configured — needs an
   * operator to act, will never resolve on its own) rather than transient
   * (a live provider fault the next scheduled scan will genuinely retry).
   * Customer-facing callers should read this instead of parsing `errors`
   * — see lib/format.ts's scanDisabledReason for the honest copy for each case.
   */
  notConfigured: boolean;
  errors: string[];
};

export type JunkCheck = { isJunk: boolean; reason?: string };

const DELETED_MARKERS = new Set(["[deleted]", "[removed]", "[removed by moderator]"]);

// Case-insensitive substring matches — deliberately plain phrases, not
// regex, so this stays easy to audit and extend without surprises.
const SPAM_PATTERNS = ["link in bio", "use promo code", "50% off", "dm for rates", "whatsapp:"];

const BOT_MARKERS = ["i am a bot, and this action was performed automatically"];

const MIN_WORD_COUNT = 8;

/**
 * Cheap, pre-Gemini heuristic filter — protects API spend/latency against
 * content that's structurally never going to be a genuine opportunity
 * (deleted, near-empty, or obvious spam/bot boilerplate). Deliberately
 * narrow: this only drops posts no real reading of the text could turn
 * into an opportunity. Anything even slightly ambiguous still goes to
 * Gemini — the zero-result-integrity judgment call stays with the model,
 * not a keyword list.
 */
export function isJunkPost(conversation: Pick<NormalizedConversation, "title" | "originalText">): JunkCheck {
  const title = (conversation.title ?? "").trim();
  const body = (conversation.originalText ?? "").trim();

  if (DELETED_MARKERS.has(title.toLowerCase()) || DELETED_MARKERS.has(body.toLowerCase())) {
    return { isJunk: true, reason: "deleted_or_removed" };
  }

  const combined = `${title} ${body}`.trim();
  const wordCount = combined.length === 0 ? 0 : combined.split(/\s+/).length;
  if (wordCount < MIN_WORD_COUNT) {
    return { isJunk: true, reason: `too_short (${wordCount} word${wordCount === 1 ? "" : "s"})` };
  }

  const lower = combined.toLowerCase();
  for (const pattern of SPAM_PATTERNS) {
    if (lower.includes(pattern)) {
      return { isJunk: true, reason: `spam_pattern: "${pattern}"` };
    }
  }
  for (const marker of BOT_MARKERS) {
    if (lower.includes(marker)) {
      return { isJunk: true, reason: "bot_meta_marker" };
    }
  }

  return { isJunk: false };
}

/**
 * Inserts a normalized conversation for a campaign, deduping on
 * (source, sourceId). The check-then-insert below isn't atomic, so a
 * second scan racing this one (a different campaign surfacing the same
 * post, or the daily cron overlapping a manual click) can pass the
 * findUnique check before either has inserted — the loser then hits the
 * real database-level (source, sourceId) unique constraint on create().
 * That's a benign duplicate, not a real error: catch it specifically
 * (Prisma P2002) and resolve to whichever row actually won the race,
 * instead of letting it surface as an unhandled ingestion error.
 */
async function ingestOne(campaignId: string, nc: NormalizedConversation) {
  if (nc.sourceId) {
    const existing = await prisma.conversation.findUnique({
      where: { source_sourceId: { source: nc.source, sourceId: nc.sourceId } },
    });
    if (existing) return { conversation: existing, isNew: false };
  }

  try {
    const conversation = await prisma.conversation.create({
      data: {
        campaignId,
        source: nc.source,
        sourceId: nc.sourceId,
        authorRef: nc.authorRef,
        title: nc.title,
        originalText: nc.originalText,
        url: nc.url,
        community: nc.community,
        postedAt: nc.postedAt,
        metadata: nc.metadata ? JSON.stringify(nc.metadata) : null,
        foundByTerms: nc.foundByTerms ? JSON.stringify(nc.foundByTerms) : null,
      },
    });
    return { conversation, isNew: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && nc.sourceId) {
      const existing = await prisma.conversation.findUnique({
        where: { source_sourceId: { source: nc.source, sourceId: nc.sourceId } },
      });
      if (existing) return { conversation: existing, isNew: false };
    }
    throw err;
  }
}

/**
 * Runs Stage 1 analysis on one conversation and, if and only if it's a
 * genuine opportunity, creates the Opportunity row. Returns null on a
 * legitimate zero-result — that is a successful outcome, not an error.
 */
export async function runAnalysisForConversation(conversationId: string, offer: Offer) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { opportunity: true, campaign: true },
  });
  if (!conversation || conversation.opportunity) return null;

  const nc: NormalizedConversation = {
    source: conversation.source,
    sourceId: conversation.sourceId,
    authorRef: conversation.authorRef,
    title: conversation.title,
    originalText: conversation.originalText,
    url: conversation.url,
    community: conversation.community,
    postedAt: conversation.postedAt,
  };

  const result = await analyzeConversation(nc, offer, conversation.campaign.exclusions);

  // Recorded regardless of outcome, right after a real Gemini verdict comes
  // back — this is what makes "never analyzed" distinguishable from
  // "analyzed and correctly rejected" (see the field's own doc comment in
  // schema.prisma). Left unset if analyzeConversation throws above, so a
  // transient failure gets naturally retried by a future scan's backlog
  // pass instead of being wrongly marked done.
  await prisma.conversation
    .update({ where: { id: conversation.id }, data: { analyzedAt: new Date() } })
    .catch((err) => console.error(`[runAnalysisForConversation] failed to mark analyzedAt for conversation ${conversation.id}:`, err));

  if (!result) return null;

  // conversationId is @unique on Opportunity, so the DB is the real backstop
  // — but the check-then-act above (findUnique, then this create, with a
  // slow Gemini call in between) isn't atomic. Multiple query surfaces can
  // discover the same post, and Conversation is deduped GLOBALLY (not per
  // campaign — @@unique([source, sourceId])), so two different campaigns'
  // scans (or an overlapping cron + manual click) can both reach this
  // function for the same conversationId before either has created the
  // Opportunity. That's a benign race, not a real error: catch it
  // specifically (Prisma P2002) and resolve to whichever row actually won,
  // exactly like ingestOne() already does for Conversation creation above.
  let opportunity;
  try {
    opportunity = await prisma.opportunity.create({
      data: {
        conversationId: conversation.id,
        intentScore: result.intent_score,
        fitScore: result.fit_score,
        matchScore: result.match_score,
        confidence: result.confidence,
        detectedNeed: result.detected_need,
        whyNow: result.why_now,
        reasoning: JSON.stringify(result.reasoning),
        safetyLabel: result.safety_label,
        safetyReason: result.safety_reason,
        recommendedAction: result.recommended_action,
        intentCategory: result.intent_category,
        priorityTier: priorityTierFromMatchScore(result.match_score),
        promptVersion: ANALYSIS_PROMPT_VERSION,
        activity: { create: { event: "surfaced", note: "Scout identified this as a genuine opportunity." } },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.opportunity.findUnique({ where: { conversationId: conversation.id } });
      if (existing) return existing;
    }
    throw err;
  }

  // Exploitation half of rotation: whichever discovery term(s) actually
  // found this post get credit now that it's a confirmed genuine
  // opportunity, not just a raw candidate — see searchOrchestrator.ts's
  // rankTerms for how this feeds back into future scans. Conversations
  // ingested before this field existed only have the legacy
  // foundBySurfaces value, which the new DiscoveryTerm table doesn't
  // recognize — nothing to credit for those, which is correct, not a bug.
  if (conversation.foundByTerms) {
    try {
      const termIds: string[] = JSON.parse(conversation.foundByTerms);
      await creditOpportunityToTerms(termIds);
    } catch (err) {
      console.error(`[runAnalysisForConversation] failed to parse foundByTerms for conversation ${conversation.id}:`, err);
    }
  }

  return opportunity;
}

/**
 * Full scan for a campaign: search the campaign's configured source,
 * ingest new conversations, analyze each one. Manual-source campaigns have
 * nothing to search — conversations arrive one at a time via the import
 * action instead, which calls runAnalysisForConversation directly.
 */
export async function runScanForCampaign(campaignId: string): Promise<IngestResult> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { keywords: true, company: { include: { offer: true } } },
  });

  const result: IngestResult = {
    conversationsIngested: 0,
    opportunitiesCreated: 0,
    skippedDuplicates: 0,
    skippedJunk: 0,
    cacheHit: null,
    notConfigured: false,
    errors: [],
  };

  if (campaign.sourceType === "manual") {
    result.errors.push("This campaign's source is manual — import conversations directly instead of scanning.");
    return result;
  }

  const offer = campaign.company.offer;
  if (!offer) {
    result.notConfigured = true;
    result.errors.push("No offer profile found for this company.");
    return result;
  }

  const adapter = getAdapter(campaign.sourceType);
  const health = await adapter.health();
  if (health.status !== "ok") {
    // Raw provider detail (vendor name, balance, env var hints) belongs in
    // server logs for whoever operates this deployment — never in what a
    // customer-facing surface returns. result.errors stays the detailed,
    // admin-facing record (consumed by the cron route's JSON summary);
    // callers building a customer-facing message should use
    // lib/format.ts's scanDisabledReason instead of this array's contents.
    console.error(`[runScanForCampaign] provider unhealthy for campaign ${campaign.id} (${campaign.sourceType}): ${health.message}`);
    result.notConfigured = health.status === "not_configured";
    result.errors.push(health.message);
    return result;
  }

  const keywords = campaign.keywords.filter((k) => k.type === "keyword").map((k) => k.term);
  const topics = campaign.keywords.filter((k) => k.type === "topic").map((k) => k.term);
  const communities = campaign.keywords
    .filter((k) => k.type === "subreddit")
    .map((k) => k.term);

  // Durable per-scan history — the answer to "why is IntentScout producing
  // fewer leads" needs real numbers over time, not just the ephemeral
  // console.log lines and the five lastScan* fields on Campaign (which only
  // ever remember the most recent scan). Created before the search call so
  // its id can be threaded through to the orchestrator, which writes
  // SearchSurfaceRun rows against it as each query executes.
  const scanStartedAt = new Date();
  const scanRun = await prisma.scanRun.create({ data: { campaignId: campaign.id, startedAt: scanStartedAt } });

  let conversations: NormalizedConversation[] = [];
  try {
    conversations = await adapter.search({
      keywords,
      topics,
      communities,
      limit: 100,
      maxAgeHours: campaign.maxLeadAgeHours,
      campaignId: campaign.id,
      companyId: campaign.companyId,
      geography: offer.geography,
      scanRunId: scanRun.id,
    });
    console.log(`[runScanForCampaign] campaign ${campaign.id}: ${conversations.length} raw conversation(s) to ingest`);

    // The cache check itself already happened inside the provider's own
    // service layer (lib/providers/{redditapis,twitterapis}/service.ts) —
    // every call there goes cache → budget → network → ledger, so a
    // request this campaign already made within the cache TTL is served
    // from ProviderRequestCache and never reaches the network, with
    // cacheHit:true written to the exact same ProviderUsageEvent row a
    // live call would produce. That's deliberately not duplicated here
    // with a second cache keyed on campaignId+keywords+communities+
    // maxAgeHours — those fields are exactly what the adapter derives the
    // real request params from, so a second cache would just be checking
    // the same thing through a different, driftable key. What's missing
    // is visibility, not the check itself — surface it by reading back
    // the ledger row the call (cached or not) just wrote.
    const lastUsage = await prisma.providerUsageEvent.findFirst({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: "desc" },
    });
    result.cacheHit = lastUsage?.cacheHit ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown ingestion error.";
    console.error(`[runScanForCampaign] search failed for campaign ${campaign.id} (${campaign.sourceType}):`, err);
    result.errors.push(message);
    await prisma.scanRun
      .update({
        where: { id: scanRun.id },
        data: { durationMs: Date.now() - scanStartedAt.getTime(), providerErrors: 1 },
      })
      .catch(() => {}); // metrics-only — never let this mask the real search failure above
    return result;
  }

  // Ingest first — cheap, just dedup lookups + inserts, fine to do sequentially.
  // The junk filter runs here too, in memory, before anything reaches the
  // Gemini queue below — it still gets stored (so dedup keeps working next
  // scan and the count stays honest), it just never gets analyzed.
  const newConversationIds: string[] = [];
  for (const nc of conversations) {
    try {
      const { conversation, isNew } = await ingestOne(campaignId, nc);
      if (!isNew) {
        result.skippedDuplicates += 1;
        continue;
      }
      result.conversationsIngested += 1;

      const junk = isJunkPost(nc);
      if (junk.isJunk) {
        result.skippedJunk += 1;
        continue;
      }

      newConversationIds.push(conversation.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error while ingesting a conversation.";
      console.error(`[runScanForCampaign] ingestion failed for campaign ${campaign.id}:`, err);
      result.errors.push(message);
    }
  }

  // Raised alongside the broader discovery retrieval (per-call limit now
  // 100, up to 8 discovery batches + precision + community bonus batches —
  // see searchOrchestrator.ts) which can realistically return several
  // hundred raw posts pre-dedup now. 250 is a deliberately measured
  // default, not a round-number guess: live-measured Gemini 3.6 Flash
  // analysis calls average ~2-4s including "thinking" tokens (see the
  // implementation report for real usageMetadata numbers), so at
  // ANALYSIS_CONCURRENCY=15 within a ~50s safe slice of Vercel's 60s
  // maxDuration, ~250 is a realistic, not optimistic, ceiling. Configurable
  // because real latency varies by deployment and by how much "thinking"
  // a given batch of conversations triggers.
  const MAX_ANALYSIS_PER_SCAN = Number(process.env.MAX_ANALYSIS_PER_SCAN) || 250;
  const freshToAnalyze = newConversationIds.slice(0, MAX_ANALYSIS_PER_SCAN);
  if (newConversationIds.length > MAX_ANALYSIS_PER_SCAN) {
    console.error(
      `[runScanForCampaign] campaign ${campaign.id}: ${newConversationIds.length} new conversations exceeds the ${MAX_ANALYSIS_PER_SCAN}-per-scan analysis cap — ${newConversationIds.length - MAX_ANALYSIS_PER_SCAN} ingested but deferred; will be picked up as backlog by a future scan (see below), not lost.`,
    );
  }

  // Backlog carryover: conversations ingested by an earlier scan that never
  // got analyzed (a prior scan hit MAX_ANALYSIS_PER_SCAN, or this is the
  // first scan after Conversation.analyzedAt shipped and the campaign has
  // older never-analyzed rows) get a chance to fill whatever capacity this
  // scan's own fresh discoveries don't use. Fresh conversations always take
  // priority — a backlog item is by definition less timely than something
  // just found. isJunkPost is a cheap, pure, re-evaluatable function, so
  // re-running it here instead of persisting a separate isJunk flag is both
  // simpler and self-correcting (catches posts deleted since ingestion).
  const remainingAnalysisCapacity = Math.max(0, MAX_ANALYSIS_PER_SCAN - freshToAnalyze.length);
  const backlogIds: string[] = [];
  if (remainingAnalysisCapacity > 0) {
    try {
      const backlogCandidates = await prisma.conversation.findMany({
        where: { campaignId: campaign.id, analyzedAt: null, id: { notIn: newConversationIds } },
        orderBy: { ingestedAt: "asc" },
        take: remainingAnalysisCapacity,
      });
      for (const c of backlogCandidates) {
        const junk = isJunkPost({ title: c.title, originalText: c.originalText });
        if (junk.isJunk) {
          result.skippedJunk += 1;
          await prisma.conversation.update({ where: { id: c.id }, data: { analyzedAt: new Date() } }).catch(() => {});
          continue;
        }
        backlogIds.push(c.id);
      }
    } catch (err) {
      console.error(`[runScanForCampaign] backlog lookup failed for campaign ${campaign.id}:`, err);
    }
  }

  const toAnalyze = [...freshToAnalyze, ...backlogIds];

  // Analysis is the slow part — one Gemini call per conversation. Running
  // several in flight at once keeps a scan with many new posts from running
  // long enough to hit the serverless function's execution limit, which
  // previously showed up as the whole scan failing partway with no useful
  // error, just a dead connection. Deliberately NOT raised further alongside
  // this phase's broader retrieval: live-measured Gemini 3.6 Flash calls
  // spend a real, variable amount of latency on "thinking" tokens (468-1044
  // tokens observed across simple/medium/complex posts) that concurrency
  // can't shortcut — the bottleneck is per-call generation time, not queue
  // wait, so raising concurrency further buys little and risks unknown
  // provider-side rate limiting this codebase has no visibility into.
  // Configurable because "safe" depends on the actual deployment target and
  // observed Gemini account tier, which this codebase can't know for itself.
  const ANALYSIS_CONCURRENCY = Number(process.env.ANALYSIS_CONCURRENCY) || 15;
  let aiErrorCount = 0;
  await mapWithConcurrency(toAnalyze, ANALYSIS_CONCURRENCY, async (conversationId) => {
    try {
      const opportunity = await runAnalysisForConversation(conversationId, offer);
      if (opportunity) result.opportunitiesCreated += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error while analyzing a conversation.";
      console.error(`[runScanForCampaign] analysis failed for conversation ${conversationId} (campaign ${campaign.id}):`, err);
      result.errors.push(message);
      aiErrorCount += 1;
    }
  });

  // Finalize the ScanRun row created before the search call — aggregated
  // from DiscoveryTermRun rows the orchestrator already wrote (raw counts,
  // provider call/error/cache-hit counts, distinct terms used) plus a real
  // spend lookup, so "why is IntentScout producing fewer leads" can
  // eventually be answered from durable history instead of guessed at from
  // a single console.log. Best-effort: never let an observability write
  // fail the scan itself.
  let discoveryTermsUsed = 0;
  try {
    const termRuns = await prisma.discoveryTermRun.findMany({ where: { scanRunId: scanRun.id } });
    discoveryTermsUsed = new Set(termRuns.flatMap((r) => JSON.parse(r.termIds) as string[])).size;
    // Every job (precision/discovery/community) writes exactly one
    // DiscoveryTermRun row now, success, failure, or budget-skip alike — so
    // termRuns.length IS the honest "planned" count, and rows whose
    // errorMessage starts with "skipped:" are the ones the budget check
    // stopped before they ever ran. See searchOrchestrator.ts's runDiscovery.
    const searchesSkippedBudget = termRuns.filter((r) => r.errorMessage?.startsWith("skipped:")).length;
    const spend = await prisma.providerUsageEvent.aggregate({
      where: { campaignId: campaign.id, createdAt: { gte: scanStartedAt } },
      _sum: { unitCostUsd: true },
    });
    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        durationMs: Date.now() - scanStartedAt.getTime(),
        rawProviderResults: termRuns.reduce((sum, r) => sum + r.rawCount, 0),
        uniqueConversations: conversations.length,
        skippedJunk: result.skippedJunk,
        skippedDuplicates: result.skippedDuplicates,
        aiAnalyzedCount: toAnalyze.length,
        opportunitiesCreated: result.opportunitiesCreated,
        discoveryTermsUsed,
        searchesPlanned: termRuns.length,
        searchesSkippedBudget,
        candidatesCarriedOver: backlogIds.length,
        providerCalls: termRuns.length,
        providerCacheHits: termRuns.filter((r) => r.cacheHit).length,
        providerSpendUsd: spend._sum.unitCostUsd ?? 0,
        providerErrors: termRuns.filter((r) => !r.success && !r.errorMessage?.startsWith("skipped:")).length,
        aiErrors: aiErrorCount,
        estimatedAiCostUsd: toAnalyze.length * ESTIMATED_GEMINI_COST_PER_ANALYSIS_USD,
      },
    });
  } catch (err) {
    console.error(`[runScanForCampaign] failed to finalize ScanRun for campaign ${campaign.id}:`, err);
  }

  // Full funnel, one line — lets "why is this campaign producing fewer
  // leads" be diagnosed from logs alone: bad discovery (few raw results),
  // bad retrieval (many raw, few recent), heavy overlap (many duplicates),
  // a noisy source (heavy junk), or strict qualification (many analyzed,
  // few opportunities) all look different here.
  console.log(
    `[runScanForCampaign] campaign ${campaign.id} summary: discovery terms used ${discoveryTermsUsed} -> ${conversations.length} raw -> ${result.conversationsIngested} ingested (${result.skippedDuplicates} duplicate(s), ${result.skippedJunk} junk skipped) -> ${toAnalyze.length} analyzed (${freshToAnalyze.length} fresh, ${backlogIds.length} backlog) -> ${result.opportunitiesCreated} opportunit${result.opportunitiesCreated === 1 ? "y" : "ies"}`,
  );

  // A scan genuinely ran at this point, regardless of how many opportunities it
  // finds — record that honestly, along with the real breakdown, in one write.
  // This is what lets the campaign page show real numbers for scans nobody was
  // watching happen (the daily cron), not just the ones triggered by a click.
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      lastScanAt: new Date(),
      lastScanIngested: result.conversationsIngested,
      lastScanSkippedDuplicates: result.skippedDuplicates,
      lastScanSkippedJunk: result.skippedJunk,
      lastScanOpportunities: result.opportunitiesCreated,
      lastScanCacheHit: result.cacheHit,
    },
  });

  return result;
}
