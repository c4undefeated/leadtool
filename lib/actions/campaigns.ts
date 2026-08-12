"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { defaultSourceType, isRedditConfigured } from "@/lib/sourceAvailability";

async function ownedCampaignOrThrow(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, companyId: user.companyId ?? "__none__" },
  });
  if (!campaign) throw new Error("Campaign not found.");
  return { user, campaign };
}

export type SimpleFormState = { error?: string } | undefined;

export async function createCampaignAction(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const user = await requireUser();
  if (!user.companyId) return { error: "No company on this account." };

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name your campaign." };

  const campaign = await prisma.campaign.create({
    data: { companyId: user.companyId, name, sourceType: defaultSourceType() },
  });

  redirect(`/campaigns/${campaign.id}`);
}

export async function addKeywordAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const term = String(formData.get("term") || "").trim();
  const type = String(formData.get("type") || "keyword");
  if (!term) return;

  const { campaign } = await ownedCampaignOrThrow(campaignId);
  await prisma.keyword.create({ data: { campaignId: campaign.id, term, type } });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function removeKeywordAction(formData: FormData): Promise<void> {
  const keywordId = String(formData.get("keywordId") || "");
  const campaignId = String(formData.get("campaignId") || "");
  await ownedCampaignOrThrow(campaignId);
  await prisma.keyword.delete({ where: { id: keywordId } });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function toggleCampaignStatusAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const { campaign } = await ownedCampaignOrThrow(campaignId);
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: campaign.status === "active" ? "paused" : "active" },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

// sourceType is decided once, at creation, based on whether Reddit was
// configured at that moment (see defaultSourceType()) — it never changes
// itself later just because REDDITAPIS_API_KEY becomes available. This is
// the explicit, human-triggered way to move a campaign created before that
// point onto live scanning, instead of leaving it stuck on manual forever.
export async function switchSourceToRedditAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const { campaign } = await ownedCampaignOrThrow(campaignId);
  if (campaign.sourceType !== "manual" || !isRedditConfigured()) return;
  await prisma.campaign.update({ where: { id: campaign.id }, data: { sourceType: "reddit" } });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function updateExclusionsAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const exclusions = String(formData.get("exclusions") || "").trim();
  const { campaign } = await ownedCampaignOrThrow(campaignId);
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { exclusions: exclusions || null },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}
