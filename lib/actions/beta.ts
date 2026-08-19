"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { BETA_SETTINGS_ID, resetTodaysBetaCounters } from "@/lib/beta";

const MAX_MANUAL_SCAN_LIMIT = 20; // sanity ceiling — still an admin-chosen value, not hard-coded to any single number

export async function setBetaModeAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const enabled = formData.get("enabled") === "true";
  await prisma.betaSettings.update({ where: { id: BETA_SETTINGS_ID }, data: { enabled, updatedByEmail: admin.email } });
  revalidatePath("/admin/beta");
}

/** Standalone manual-scan toggle — independent of full Beta Mode, see lib/beta.ts's isManualScanAllowed. */
export async function setManualScanEnabledAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const manualScanEnabled = formData.get("manualScanEnabled") === "true";
  await prisma.betaSettings.update({ where: { id: BETA_SETTINGS_ID }, data: { manualScanEnabled, updatedByEmail: admin.email } });
  revalidatePath("/admin/beta");
}

export async function setScanningPausedAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const paused = formData.get("paused") === "true";
  await prisma.betaSettings.update({ where: { id: BETA_SETTINGS_ID }, data: { scanningPaused: paused, updatedByEmail: admin.email } });
  revalidatePath("/admin/beta");
}

export async function setManualScanLimitAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const raw = Number(formData.get("limit"));
  const limit = Number.isFinite(raw) ? Math.min(MAX_MANUAL_SCAN_LIMIT, Math.max(0, Math.trunc(raw))) : 2;
  await prisma.betaSettings.update({ where: { id: BETA_SETTINGS_ID }, data: { manualScansPerUserPerDay: limit, updatedByEmail: admin.email } });
  revalidatePath("/admin/beta");
}

/** Zeroes every user's manual-scan count for today. Authorized administrators only. */
export async function resetTodaysBetaCountersAction(): Promise<void> {
  await requireAdmin();
  await resetTodaysBetaCounters();
  revalidatePath("/admin/beta");
}
