"use server";

import { revalidatePath } from "next/cache";
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

export async function regenerateCommunityCandidatesAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const ownedId = await ownedCampaignId(campaignId);
  await forceRegenerateCommunityCandidates(ownedId);
  revalidatePath(`/campaigns/${ownedId}`);
}
