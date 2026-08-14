"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { forceRegenerateDiscoveryTerms } from "@/lib/sources/searchOrchestrator";

/**
 * Operator-triggered discovery-pool refresh — the same generation path
 * ensureDiscoveryTerms takes automatically on staleness (a material offer
 * change or a prompt-version bump), just forced on demand. Deactivates the
 * current active pool (kept for historical yield, not deleted) and
 * generates a fresh one from the live offer profile. Void, like the other
 * plain-form campaign actions (lib/actions/campaigns.ts) — the revalidated
 * page showing the new pool is the success signal; a failure is an admin
 * concern, logged server-side rather than surfaced as a form error.
 */
export async function regenerateDiscoveryTermsAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") || "");
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, companyId: user.companyId ?? "__none__" },
  });
  if (!campaign) return;

  try {
    await forceRegenerateDiscoveryTerms(campaignId);
  } catch (err) {
    console.error(`[regenerateDiscoveryTermsAction] failed for campaign ${campaignId}:`, err);
  }
  revalidatePath(`/campaigns/${campaignId}`);
}
