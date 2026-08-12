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
      // Set the first time an opportunity reaches "contacted" via any path — never overwritten,
      // so it always reflects when the user first actually reached out, not the latest status edit.
      contactedAt: status === "contacted" && !opportunity.contactedAt ? new Date() : opportunity.contactedAt,
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

export type MarkContactedState = { error?: string } | undefined;

/**
 * The dedicated "Mark Contacted" action from the Engagement panel — distinct from the
 * generic status dropdown because it captures HOW the user engaged and, optionally,
 * exactly what they sent. IntentScout never sets this itself; it only records what the
 * human reports after sending something externally.
 */
export async function markContactedAction(
  _prev: MarkContactedState,
  formData: FormData
): Promise<MarkContactedState> {
  const opportunityId = String(formData.get("opportunityId") || "");
  const engagementType = String(formData.get("engagementType") || "").trim();
  const finalResponse = String(formData.get("finalResponse") || "").trim();

  if (!["comment", "dm", "other"].includes(engagementType)) {
    return { error: "Choose how you engaged." };
  }

  const opportunity = await ownedOpportunity(opportunityId);

  await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: {
      status: opportunity.status === "new" || opportunity.status === "reviewed" ? "contacted" : opportunity.status,
      contactedAt: opportunity.contactedAt ?? new Date(),
      engagementType,
      finalResponse: finalResponse || opportunity.finalResponse,
      activity: {
        create: {
          event: "marked_contacted",
          note: `Engaged via ${engagementType}${finalResponse ? " — final text recorded" : ""}`,
        },
      },
    },
  });

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
  return undefined;
}
