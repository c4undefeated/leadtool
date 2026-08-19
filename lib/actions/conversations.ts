"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { normalizeManualSubmission } from "@/lib/sources/manualAdapter";
import { runAnalysisForConversation, runScanForCampaign } from "@/lib/pipeline";
import { isAiConfigured } from "@/lib/sourceAvailability";
import { getBetaSettings, claimBetaScanAllowance, refundBetaScanAllowance } from "@/lib/beta";
import { classifyScanStatus } from "@/lib/dailyScan";

// Shown to customers when Scout's analysis engine isn't active for this
// account — a setup gap, not something that resolves on its own, so it
// never claims to be "retrying." Never names Gemini or an env var.
const ANALYSIS_NOT_READY_MESSAGE = "Scout's analysis engine isn't active for this account yet — contact support to enable it.";

export type ImportFormState = { error?: string; success?: string } | undefined;

async function ownedCampaign(campaignId: string) {
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, companyId: user.companyId ?? "__none__" },
    include: { company: { include: { offer: true } } },
  });
  if (!campaign) throw new Error("Campaign not found.");
  return { user, campaign };
}

export async function importConversationAction(
  _prev: ImportFormState,
  formData: FormData
): Promise<ImportFormState> {
  const campaignId = String(formData.get("campaignId") || "");
  const originalText = String(formData.get("originalText") || "").trim();
  const url = String(formData.get("url") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const community = String(formData.get("community") || "").trim();

  if (!originalText) return { error: "Paste the conversation text." };
  if (!url) return { error: "Add a link to the original conversation." };
  if (!isAiConfigured()) {
    return { error: ANALYSIS_NOT_READY_MESSAGE };
  }

  const { campaign } = await ownedCampaign(campaignId);
  if (!campaign.company.offer) return { error: "Finish onboarding before importing conversations." };

  const nc = normalizeManualSubmission({ originalText, url, title, community });
  const conversation = await prisma.conversation.create({
    data: {
      campaignId: campaign.id,
      source: nc.source,
      sourceId: nc.sourceId,
      authorRef: nc.authorRef,
      title: nc.title,
      originalText: nc.originalText,
      url: nc.url,
      community: nc.community,
      postedAt: nc.postedAt,
    },
  });

  try {
    const opportunity = await runAnalysisForConversation(conversation.id, campaign.company.offer);
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/opportunities");
    return opportunity
      ? { success: "Scout found a genuine opportunity — check the feed." }
      : { success: "Scout reviewed it and did not find genuine buying intent here. That's a valid, honest result." };
  } catch (err) {
    // Raw analysis-engine errors (validation failures, provider faults)
    // are an admin concern, not a customer one — logged server-side,
    // never echoed verbatim to the UI.
    console.error(`[importConversationAction] analysis failed for conversation ${conversation.id}:`, err);
    return { error: "Analysis is temporarily unavailable — please try again shortly." };
  }
}

export type ScanBreakdown = {
  conversationsIngested: number;
  opportunitiesCreated: number;
  skippedDuplicates: number;
  skippedJunk: number;
  cacheHit: boolean | null;
};

export type ScanState =
  | { error: string; result?: undefined; remaining?: number; limit?: number }
  | { error?: undefined; result: ScanBreakdown; remaining?: number; limit?: number }
  | undefined;

/**
 * The manual "Run scan" action — reuses the exact same production pipeline
 * (runScanForCampaign) the daily cron calls, just triggered on demand.
 * Only usable while Beta Mode is on (spec: "IntentScout — Beta Mode /
 * Controlled Manual Scanning") and capped at the admin-configured number
 * of manual scans per user per day, enforced here server-side via an
 * atomic claim (lib/beta.ts's claimBetaScanAllowance) — never trusting
 * anything the client already showed. Ownership is checked before the
 * beta cap is even consulted, so a request for a campaign the caller
 * doesn't own never burns part of their allowance.
 */
export async function runScanAction(campaignId: string): Promise<ScanState> {
  const { user } = await ownedCampaign(campaignId); // throws if this campaign isn't the caller's — checked before the beta allowance is ever touched
  if (!isAiConfigured()) {
    return { error: ANALYSIS_NOT_READY_MESSAGE };
  }

  const settings = await getBetaSettings();
  if (!settings.enabled) {
    return { error: "Manual scanning is currently unavailable." };
  }
  if (settings.scanningPaused) {
    return { error: "Manual scanning is temporarily paused by the administrator — please try again shortly." };
  }

  const claim = await claimBetaScanAllowance(user.id, settings.manualScansPerUserPerDay);
  if (!claim.allowed) {
    return {
      error: `You've used all ${settings.manualScansPerUserPerDay} of your manual scans for today. This resets at midnight UTC.`,
      remaining: 0,
      limit: settings.manualScansPerUserPerDay,
    };
  }
  const remaining = Math.max(0, claim.limit - claim.used);

  let result;
  try {
    result = await runScanForCampaign(campaignId, { trigger: "beta_manual", triggeredByUserId: user.id });
  } catch (err) {
    // The scan threw before completing — never actually started in any
    // meaningful sense (spec section 14), so give the allowance back.
    await refundBetaScanAllowance(user.id);
    console.error(`[runScanAction] beta manual scan threw for campaign ${campaignId}:`, err);
    return { error: "Scan failed to start — please try again.", remaining: Math.min(settings.manualScansPerUserPerDay, remaining + 1), limit: settings.manualScansPerUserPerDay };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/opportunities");

  // Nothing meaningful happened (no offer profile, provider unhealthy, or
  // the search call itself failed before touching anything) — refund
  // rather than charge the user's allowance for a scan that never really
  // ran (spec section 14). Reuses the exact same classification the daily
  // cron already relies on (lib/dailyScan.ts's classifyScanStatus) instead
  // of a second, potentially-drifting definition of "didn't really run."
  const scanStatus = classifyScanStatus(result);
  const neverStarted = scanStatus === "not_configured" || scanStatus === "failed";
  if (neverStarted) {
    await refundBetaScanAllowance(user.id);
  }
  const finalRemaining = neverStarted ? Math.min(settings.manualScansPerUserPerDay, remaining + 1) : remaining;

  if (result.errors.length > 0) {
    // result.errors carries the real, detailed, admin-facing record
    // (already logged server-side inside runScanForCampaign) — a customer
    // only ever sees one of two honest, non-technical states: a permanent
    // setup gap that needs a human, or a live fault the next scheduled
    // scan will genuinely retry.
    return {
      error: result.notConfigured
        ? "Live scanning isn't enabled for this campaign yet — contact support to turn it on."
        : "Scan engine temporarily paused — retrying automatically.",
      remaining: finalRemaining,
      limit: settings.manualScansPerUserPerDay,
    };
  }

  return {
    result: {
      conversationsIngested: result.conversationsIngested,
      opportunitiesCreated: result.opportunitiesCreated,
      skippedDuplicates: result.skippedDuplicates,
      skippedJunk: result.skippedJunk,
      cacheHit: result.cacheHit,
    },
    remaining: finalRemaining,
    limit: settings.manualScansPerUserPerDay,
  };
}
