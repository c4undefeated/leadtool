"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { defaultSourceType, isRedditConfigured, isTwitterConfigured } from "@/lib/sourceAvailability";

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

  // Only trust an explicitly-chosen source if it's actually configured —
  // otherwise fall back to the same auto-pick a plain "name only" submit
  // would get, rather than creating a campaign pointed at a dead source.
  const requestedSource = String(formData.get("sourceType") || "");
  const sourceType =
    (requestedSource === "reddit" && isRedditConfigured()) ||
    (requestedSource === "twitter" && isTwitterConfigured()) ||
    requestedSource === "manual"
      ? (requestedSource as "reddit" | "twitter" | "manual")
      : defaultSourceType();

  const campaign = await prisma.campaign.create({
    data: { companyId: user.companyId, name, sourceType },
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
  // deleteMany instead of delete: a double-click (or a stale row already
  // removed by another tab) means zero rows match, not an error — the end
  // state the user wants (this keyword gone) is already true either way.
  await prisma.keyword.deleteMany({ where: { id: keywordId, campaignId } });
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

/** Same idea as switchSourceToRedditAction, for TwitterAPIs. */
export async function switchSourceToTwitterAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const { campaign } = await ownedCampaignOrThrow(campaignId);
  if (campaign.sourceType !== "manual" || !isTwitterConfigured()) return;
  await prisma.campaign.update({ where: { id: campaign.id }, data: { sourceType: "twitter" } });
  revalidatePath(`/campaigns/${campaignId}`);
}

const VALID_MAX_LEAD_AGE_HOURS = [12, 24, 48, 168, 720] as const;

/** How recent a live-scanned post must be to surface at all — see lib/sources/redditApisAdapter.ts for enforcement. */
export async function updateMaxLeadAgeAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const hours = Number(formData.get("maxLeadAgeHours"));
  if (!VALID_MAX_LEAD_AGE_HOURS.includes(hours as (typeof VALID_MAX_LEAD_AGE_HOURS)[number])) return;

  const { campaign } = await ownedCampaignOrThrow(campaignId);
  await prisma.campaign.update({ where: { id: campaign.id }, data: { maxLeadAgeHours: hours } });
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
