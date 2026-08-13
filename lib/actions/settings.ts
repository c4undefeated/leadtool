"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getVerticalTemplate } from "@/lib/verticals";

export type OfferSettingsState = { error?: string; success?: string } | undefined;

export async function updateOfferSettingsAction(
  _prev: OfferSettingsState,
  formData: FormData
): Promise<OfferSettingsState> {
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

  revalidatePath("/settings/offer");
  return { success: "Saved. Scout will use this on every scan from now on." };
}
