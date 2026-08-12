"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateEngagementRecommendation } from "@/lib/ai/engagement";
import type { NormalizedConversation } from "@/lib/sources/types";

export type GenerateEngagementState = { error?: string } | undefined;

export async function generateEngagementAction(opportunityId: string): Promise<GenerateEngagementState> {
  const user = await requireUser();
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, conversation: { campaign: { companyId: user.companyId ?? "__none__" } } },
    include: { conversation: true },
  });
  if (!opportunity) return { error: "Opportunity not found." };

  const offer = await prisma.offer.findUnique({ where: { companyId: user.companyId! } });
  if (!offer) return { error: "No offer profile found." };

  const nc: NormalizedConversation = {
    source: opportunity.conversation.source,
    sourceId: opportunity.conversation.sourceId,
    authorRef: opportunity.conversation.authorRef,
    title: opportunity.conversation.title,
    originalText: opportunity.conversation.originalText,
    url: opportunity.conversation.url,
    community: opportunity.conversation.community,
    postedAt: opportunity.conversation.postedAt,
  };

  // Each generate/regenerate creates a new EngagementRecommendation row, ordered by
  // createdAt — that row is the version history. commentDraft/dmDraft.version exists
  // for future per-draft edit tracking and starts at 1 every time.
  try {
    const result = await generateEngagementRecommendation(
      nc,
      offer,
      opportunity.detectedNeed,
      opportunity.safetyLabel,
      opportunity.safetyReason
    );

    await prisma.engagementRecommendation.create({
      data: {
        opportunityId: opportunity.id,
        strategy: result.strategy,
        strategyReason: result.strategy_reason,
        avoidGuidance: result.avoid_guidance,
        commentDraft: result.comment_draft
          ? { create: { text: result.comment_draft, whyThisResponse: result.comment_why ?? "" } }
          : undefined,
        dmDraft: result.dm_draft
          ? { create: { text: result.dm_draft, whyThisResponse: result.dm_why ?? "" } }
          : undefined,
      },
    });

    await prisma.activity.create({
      data: { opportunityId: opportunity.id, event: "engagement_generated", note: `Strategy: ${result.strategy}` },
    });

    revalidatePath(`/opportunities/${opportunityId}`);
    return undefined;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Engagement generation failed." };
  }
}
