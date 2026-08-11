"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const VALID_STATUSES = [
  "new",
  "reviewed",
  "saved",
  "dismissed",
  "contacted",
  "replied",
  "qualified",
  "won",
  "lost",
] as const;

async function ownedOpportunity(opportunityId: string) {
  const user = await requireUser();
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, conversation: { campaign: { companyId: user.companyId ?? "__none__" } } },
  });
  if (!opportunity) throw new Error("Opportunity not found.");
  return opportunity;
}

export async function updateOpportunityStatusAction(formData: FormData): Promise<void> {
  const opportunityId = String(formData.get("opportunityId") || "");
  const status = String(formData.get("status") || "");
  const note = String(formData.get("note") || "").trim();
  const estimatedValueRaw = String(formData.get("estimatedValue") || "").trim();

  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) return;

  const opportunity = await ownedOpportunity(opportunityId);

  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: {
      status,
      outcome: status === "won" ? "won" : status === "lost" ? "lost" : opportunity.outcome,
      estimatedValue: estimatedValueRaw ? Number(estimatedValueRaw) : opportunity.estimatedValue,
      activity: {
        create: {
          event: `status_changed:${status}`,
          note: note || null,
        },
      },
    },
  });

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
}
