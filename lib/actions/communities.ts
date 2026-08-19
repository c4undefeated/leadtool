"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { approveCommunityCandidate, rejectCommunityCandidate, forceRegenerateCommunityCandidates } from "@/lib/sources/communityDiscovery";

async function ownedCampaignId(campaignId: string): Promise<string> {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, companyId: user.companyId ?? "__none__" }, select: { id: true } });
  if (!campaign) throw new Error("Campaign not found.");
  return campaign.id;
}

export async function approveCommunityCandidateAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const candidateId = String(formData.get("candidateId") || "");
  const ownedId = await ownedCampaignId(campaignId);
  await approveCommunityCandidate(ownedId, candidateId);
  revalidatePath(`/campaigns/${ownedId}`);
}

export async function rejectCommunityCandidateAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const candidateId = String(formData.get("candidateId") || "");
  const ownedId = await ownedCampaignId(campaignId);
  await rejectCommunityCandidate(ownedId, candidateId);
  revalidatePath(`/campaigns/${ownedId}`);
}

/**
 * Deferred via after(), unlike the discovery-term/X-phrase "Regenerate"
 * button (lib/actions/discovery.ts), which blocks on exactly one bounded
 * Gemini call. Community regeneration chains a Gemini call with up to
 * MAX_COMMUNITY_CANDIDATES_TO_VALIDATE real provider validation calls —
 * real, variable latency a customer's click shouldn't have to wait on (a
 * live-verified case exceeded Vercel's function time limit before this
 * fix). New suggestions appear on the next page load once the background
 * work finishes, typically within a few tens of seconds.
 */
export async function regenerateCommunityCandidatesAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const ownedId = await ownedCampaignId(campaignId);
  after(() => forceRegenerateCommunityCandidates(ownedId).catch((err) => console.error(`[regenerateCommunityCandidatesAction] failed for campaign ${ownedId}:`, err)));
  revalidatePath(`/campaigns/${ownedId}`);
}
