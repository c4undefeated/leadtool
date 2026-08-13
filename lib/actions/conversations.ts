"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { normalizeManualSubmission } from "@/lib/sources/manualAdapter";
import { runAnalysisForConversation, runScanForCampaign } from "@/lib/pipeline";
import { isAiConfigured } from "@/lib/sourceAvailability";

// Shown to customers when Scout's analysis engine isn't active for this
// account — a setup gap, not something that resolves on its own, so it
// never claims to be "retrying." Never names Gemini or an env var.
const ANALYSIS_NOT_READY_MESSAGE = "Scout's analysis engine isn't active for this account yet — contact support to enable it.";

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
    return { error: ANALYSIS_NOT_READY_MESSAGE };
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
    // Raw analysis-engine errors (validation failures, provider faults)
    // are an admin concern, not a customer one — logged server-side,
    // never echoed verbatim to the UI.
    console.error(`[importConversationAction] analysis failed for conversation ${conversation.id}:`, err);
    return { error: "Analysis is temporarily unavailable — please try again shortly." };
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
    return { error: ANALYSIS_NOT_READY_MESSAGE };
  }
  const result = await runScanForCampaign(campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/opportunities");

  if (result.errors.length > 0) {
    // result.errors carries the real, detailed, admin-facing record
    // (already logged server-side inside runScanForCampaign) — a customer
    // only ever sees one of two honest, non-technical states: a permanent
    // setup gap that needs a human, or a live fault the next scheduled
    // scan will genuinely retry.
    return {
      error: result.notConfigured
        ? "Live scanning isn't enabled for this campaign yet — contact support to turn it on."
        : "Scan engine temporarily paused — retrying automatically.",
    };
  }

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
