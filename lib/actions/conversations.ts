"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { normalizeManualSubmission } from "@/lib/sources/manualAdapter";
import { runAnalysisForConversation, runScanForCampaign } from "@/lib/pipeline";
import { isAiConfigured } from "@/lib/sourceAvailability";

export type ImportFormState = { error?: string; success?: string } | undefined;

async function ownedCampaign(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, companyId: user.companyId ?? "__none__" },
    include: { company: { include: { offer: true } } },
  });
  if (!campaign) throw new Error("Campaign not found.");
  return campaign;
}

export async function importConversationAction(
  _prev: ImportFormState,
  formData: FormData
): Promise<ImportFormState> {
  const campaignId = String(formData.get("campaignId") || "");
  const originalText = String(formData.get("originalText") || "").trim();
  const url = String(formData.get("url") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const community = String(formData.get("community") || "").trim();

  if (!originalText) return { error: "Paste the conversation text." };
  if (!url) return { error: "Add a link to the original conversation." };
  if (!isAiConfigured()) {
    return {
      error:
        "GEMINI_API_KEY is not set, so Scout can't analyze anything yet. Add it to .env and restart — see README.md.",
    };
  }

  const campaign = await ownedCampaign(campaignId);
  if (!campaign.company.offer) return { error: "Finish onboarding before importing conversations." };

  const nc = normalizeManualSubmission({ originalText, url, title, community });
  const conversation = await prisma.conversation.create({
    data: {
      campaignId: campaign.id,
      source: nc.source,
      sourceId: nc.sourceId,
      authorRef: nc.authorRef,
      title: nc.title,
      originalText: nc.originalText,
      url: nc.url,
      community: nc.community,
      postedAt: nc.postedAt,
    },
  });

  try {
    const opportunity = await runAnalysisForConversation(conversation.id, campaign.company.offer);
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/opportunities");
    return opportunity
      ? { success: "Scout found a genuine opportunity — check the feed." }
      : { success: "Scout reviewed it and did not find genuine buying intent here. That's a valid, honest result." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Analysis failed." };
  }
}

export type ScanBreakdown = {
  conversationsIngested: number;
  opportunitiesCreated: number;
  skippedDuplicates: number;
  skippedJunk: number;
  cacheHit: boolean | null;
};

export type ScanState = { error: string; result?: undefined } | { error?: undefined; result: ScanBreakdown } | undefined;

export async function runScanAction(campaignId: string): Promise<ScanState> {
  await ownedCampaign(campaignId);
  if (!isAiConfigured()) {
    return { error: "GEMINI_API_KEY is not set — analysis is unavailable until it is." };
  }
  const result = await runScanForCampaign(campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/opportunities");

  if (result.errors.length > 0) return { error: result.errors.join(" ") };
  return {
    result: {
      conversationsIngested: result.conversationsIngested,
      opportunitiesCreated: result.opportunitiesCreated,
      skippedDuplicates: result.skippedDuplicates,
      skippedJunk: result.skippedJunk,
      cacheHit: result.cacheHit,
    },
  };
}
