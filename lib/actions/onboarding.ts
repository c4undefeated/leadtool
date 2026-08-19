"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getVerticalTemplate } from "@/lib/verticals";
import { defaultSourceType } from "@/lib/sourceAvailability";
import { ensureDiscoveryTerms } from "@/lib/sources/searchOrchestrator";
import { ensureCommunityCandidates } from "@/lib/sources/communityDiscovery";

export type OnboardingFormState = { error?: string } | undefined;

export async function completeOnboardingAction(
  _prev: OnboardingFormState,
  formData: FormData
): Promise<OnboardingFormState> {
  const user = await requireUser();
  if (!user.companyId) return { error: "No company on this account." };

  const verticalKey = String(formData.get("verticalTemplateKey") || "other");
  const businessType = String(formData.get("businessType") || "").trim();
  const whatYouSell = String(formData.get("whatYouSell") || "").trim();
  const problemsSolved = String(formData.get("problemsSolved") || "").trim();
  const idealCustomer = String(formData.get("idealCustomer") || "").trim();
  const geography = String(formData.get("geography") || "").trim();
  const excludedAudiences = String(formData.get("excludedAudiences") || "").trim();
  const brandVoice = String(formData.get("brandVoice") || "").trim();
  const engagementStyle = String(formData.get("engagementStyle") || "").trim();
  const priceMinRaw = String(formData.get("priceRangeMin") || "").trim();
  const priceMaxRaw = String(formData.get("priceRangeMax") || "").trim();

  if (!whatYouSell) return { error: "Tell Scout what you sell." };
  if (!idealCustomer) return { error: "Describe your ideal customer." };

  const template = getVerticalTemplate(verticalKey);

  await prisma.offer.upsert({
    where: { companyId: user.companyId },
    create: {
      companyId: user.companyId,
      verticalTemplateKey: template.key,
      businessType,
      whatYouSell,
      problemsSolved,
      idealCustomer,
      geography: geography || null,
      excludedAudiences: excludedAudiences || null,
      brandVoice: brandVoice || null,
      engagementStyle: engagementStyle || null,
      priceRangeMin: priceMinRaw ? Number(priceMinRaw) : null,
      priceRangeMax: priceMaxRaw ? Number(priceMaxRaw) : null,
    },
    update: {
      verticalTemplateKey: template.key,
      businessType,
      whatYouSell,
      problemsSolved,
      idealCustomer,
      geography: geography || null,
      excludedAudiences: excludedAudiences || null,
      brandVoice: brandVoice || null,
      engagementStyle: engagementStyle || null,
      priceRangeMin: priceMinRaw ? Number(priceMinRaw) : null,
      priceRangeMax: priceMaxRaw ? Number(priceMaxRaw) : null,
    },
  });

  const existingCampaign = await prisma.campaign.findFirst({ where: { companyId: user.companyId } });
  let campaignId = existingCampaign?.id;
  let isNewCampaign = false;

  if (!existingCampaign) {
    // Vertical templates used to also seed a handful of literal
    // "looking for a coach"-style keyword phrases here — the exact old
    // exact-keyword-monitoring pattern the discovery engine replaced.
    // Subreddit suggestions are a different, orthogonal concern (WHERE to
    // look, not HOW to phrase a search) and stay useful as a starter set;
    // keyword phrases don't, now that discovery generation (triggered
    // below) does the real work immediately.
    const campaign = await prisma.campaign.create({
      data: {
        companyId: user.companyId,
        name: `${template.label} — first campaign`,
        sourceType: defaultSourceType(),
        keywords: { create: template.seedSubreddits.map((term) => ({ term, type: "subreddit" })) },
      },
    });
    campaignId = campaign.id;
    isNewCampaign = true;
  }

  // Generate the discovery profile right away rather than waiting for a
  // scan to trigger it lazily, so both onboarding paths (website-prefilled
  // or fully manual — both only ever produce this same Offer row) land on
  // a campaign page that's already "thinking," not an empty one asking for
  // a manual click first. Scheduled via after() so the ~20s Gemini call
  // doesn't block this redirect; the campaign page's existing "no concepts
  // generated yet" state covers the brief window before it finishes.
  if (isNewCampaign && campaignId) {
    const idForAfter = campaignId;
    after(() =>
      Promise.all([
        ensureDiscoveryTerms(idForAfter),
        ensureCommunityCandidates(idForAfter),
      ]).catch((err) => console.error(`[completeOnboardingAction] discovery generation failed for campaign ${idForAfter}:`, err)),
    );
  }

  redirect(`/campaigns/${campaignId}`);
}
