import { prisma } from "@/lib/prisma";
import { getAdapter } from "@/lib/sources";
import type { NormalizedConversation } from "@/lib/sources/types";
import { analyzeConversation, ANALYSIS_PROMPT_VERSION } from "@/lib/ai/analysis";
import { priorityTierFromMatchScore } from "@/lib/ai/schemas";
import type { Offer } from "@prisma/client";

export type IngestResult = {
  conversationsIngested: number;
  opportunitiesCreated: number;
  skipped: number;
  errors: string[];
};

/** Inserts a normalized conversation for a campaign, deduping on (source, sourceId). */
async function ingestOne(campaignId: string, nc: NormalizedConversation) {
  if (nc.sourceId) {
    const existing = await prisma.conversation.findUnique({
      where: { source_sourceId: { source: nc.source, sourceId: nc.sourceId } },
    });
    if (existing) return { conversation: existing, isNew: false };
  }

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
    },
  });
  return { conversation, isNew: true };
}

/**
 * Runs Stage 1 analysis on one conversation and, if and only if it's a
 * genuine opportunity, creates the Opportunity row. Returns null on a
 * legitimate zero-result — that is a successful outcome, not an error.
 */
export async function runAnalysisForConversation(conversationId: string, offer: Offer) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { opportunity: true },
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

  const result = await analyzeConversation(nc, offer);
  if (!result) return null;

  const opportunity = await prisma.opportunity.create({
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
      priorityTier: priorityTierFromMatchScore(result.match_score),
      promptVersion: ANALYSIS_PROMPT_VERSION,
      activity: { create: { event: "surfaced", note: "Scout identified this as a genuine opportunity." } },
    },
  });

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

  const result: IngestResult = { conversationsIngested: 0, opportunitiesCreated: 0, skipped: 0, errors: [] };

  if (campaign.sourceType === "manual") {
    result.errors.push("This campaign's source is manual — import conversations directly instead of scanning.");
    return result;
  }

  const offer = campaign.company.offer;
  if (!offer) {
    result.errors.push("No offer profile found for this company.");
    return result;
  }

  const adapter = getAdapter(campaign.sourceType);
  const health = await adapter.health();
  if (health.status !== "ok") {
    result.errors.push(health.message);
    return result;
  }

  const keywords = campaign.keywords.filter((k) => k.type === "keyword").map((k) => k.term);
  const communities = campaign.keywords
    .filter((k) => k.type === "subreddit")
    .map((k) => k.term);

  let conversations: NormalizedConversation[] = [];
  try {
    conversations = await adapter.search({ keywords, communities, limit: 25 });
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "Unknown ingestion error.");
    return result;
  }

  for (const nc of conversations) {
    try {
      const { conversation, isNew } = await ingestOne(campaignId, nc);
      if (!isNew) {
        result.skipped += 1;
        continue;
      }
      result.conversationsIngested += 1;
      const opportunity = await runAnalysisForConversation(conversation.id, offer);
      if (opportunity) result.opportunitiesCreated += 1;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : "Unknown error while processing a conversation.");
    }
  }

  return result;
}
