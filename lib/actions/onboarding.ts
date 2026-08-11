"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getVerticalTemplate } from "@/lib/verticals";
import { defaultSourceType } from "@/lib/sourceAvailability";

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

  if (!existingCampaign) {
    const campaign = await prisma.campaign.create({
      data: {
        companyId: user.companyId,
        name: `${template.label} — first campaign`,
        sourceType: defaultSourceType(),
        keywords: {
          create: [
            ...template.seedKeywords.map((term) => ({ term, type: "keyword" })),
            ...template.seedSubreddits.map((term) => ({ term, type: "subreddit" })),
          ],
        },
      },
    });
    campaignId = campaign.id;
  }

  redirect(`/campaigns/${campaignId}`);
}
