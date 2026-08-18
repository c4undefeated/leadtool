"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { checkBusinessCreationAllowed } from "@/lib/billing/entitlements";

export type BusinessActionState = { error?: string } | undefined;

/**
 * Creates a new business (Company) under the caller's account and makes
 * it their active business, then sends them through the existing
 * onboarding flow (completeOnboardingAction, lib/actions/onboarding.ts)
 * to collect its Offer profile — reused entirely unmodified, since that
 * action already keys off `user.companyId` (the active business) with no
 * awareness of accounts at all.
 */
export async function createBusinessAction(_prev: BusinessActionState, formData: FormData): Promise<BusinessActionState> {
  const user = await requireUser();
  if (!user.accountId) return { error: "No account on this login." };

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name your business." };

  // Server-authoritative limit check — never trust a frontend "you can add
  // another business" state. Re-verified here regardless of what the
  // business-switcher UI already showed.
  const entitlement = await checkBusinessCreationAllowed(user.accountId);
  if (!entitlement.allowed) return { error: entitlement.reason };

  const company = await prisma.company.create({ data: { name, accountId: user.accountId } });
  await prisma.user.update({ where: { id: user.id }, data: { companyId: company.id } });

  redirect("/onboarding");
}

/** Renames the caller's currently ACTIVE business only — never another business, even one the same account owns. */
export async function renameBusinessAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!user.companyId || !name) return;

  await prisma.company.update({ where: { id: user.companyId }, data: { name } });
  revalidatePath("/", "layout");
}

/**
 * Switches the caller's active business. The target company id always
 * comes from client input (a form field / link) and is NEVER trusted on
 * its own — this re-verifies server-side that it actually belongs to the
 * caller's own account before switching anything, so a manipulated
 * companyId can't attach another account's business as "active."
 */
export async function switchBusinessAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const companyId = String(formData.get("companyId") || "");
  if (!user.accountId || !companyId) return;

  const owned = await prisma.company.findFirst({ where: { id: companyId, accountId: user.accountId }, select: { id: true } });
  if (!owned) return; // silently ignore — not a business this account owns

  await prisma.user.update({ where: { id: user.id }, data: { companyId: owned.id } });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
