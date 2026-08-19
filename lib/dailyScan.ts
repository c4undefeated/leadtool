import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/concurrency";
import { runScanForCampaign, type IngestResult } from "@/lib/pipeline";
import { isCompanyEligibleForScanning } from "@/lib/billing/entitlements";
import { getBetaSettings } from "@/lib/beta";

/**
 * The always-on daily scan orchestrator (spec: "IntentScout should behave
 * like a true always-on intent-monitoring product"). This is the ONLY
 * thing app/api/cron/scan-campaigns/route.ts calls — it owns "which
 * campaigns get scanned today and in what order," nothing about how a
 * single campaign is actually scanned. That logic already exists and is
 * untouched: this module just calls runScanForCampaign (lib/pipeline.ts)
 * per eligible campaign, the same function the manual "Run scan" button
 * has always called. No second ingestion implementation, no direct
 * provider calls here — see lib/pipeline.ts -> lib/sources/(reddit|twitter)ApisAdapter.ts
 * -> lib/providers/(redditapis|twitterapis)/service.ts for the real
 * pipeline, all of which is reused as-is.
 *
 * ARCHITECTURE
 *   CRON (app/api/cron/scan-campaigns/route.ts)
 *     -> runDailyScan() (this file)
 *       -> find ACTIVE, non-manual campaigns
 *       -> for each one that's actually due today, atomically claim it
 *          (a single conditional UPDATE — see claimCampaignForScan)
 *       -> runScanForCampaign(campaignId) — existing, unchanged
 *       -> release the claim, record the outcome
 *
 * DUE-NESS AND LOCKING
 * "Due" means: no completed scan (Campaign.lastScanAt) within the last
 * SCAN_DUE_THRESHOLD_HOURS (default 20h — comfortably under 24h so a
 * cron invocation that lands a little early or late each day still fires
 * once daily, without ever double-firing within the same day).
 *
 * A campaign is only ever actually scanned after winning an atomic claim:
 * one Prisma updateMany() with the due-check AND the lock-acquire in the
 * SAME conditional UPDATE statement. That's what makes it race-free — two
 * overlapping cron invocations (Vercel's own docs note this can happen)
 * racing to claim the same campaign will see exactly one of them get
 * count:1 and the other count:0, with no window in between where both
 * could believe they'd won. The lock (Campaign.scanLockedAt) is a lease,
 * not a permanent hold: it only counts as "held" while
 * now - scanLockedAt < SCAN_LOCK_LEASE_MINUTES, so a process that crashed
 * mid-scan naturally releases its claim on its own without manual
 * intervention.
 *
 * Duplicate DATA (not just duplicate provider spend) is additionally
 * protected at the database level exactly as before this change:
 * Conversation's @@unique([source, sourceId]) and Opportunity's
 * @@unique([conversationId]) constraints, both already handled via the
 * P2002-catch pattern in lib/pipeline.ts. The claim above is what keeps a
 * duplicate invocation from wastefully re-paying a provider in the first
 * place; the DB constraints are the backstop if it ever did anyway.
 */

const SCAN_DUE_THRESHOLD_HOURS = Number(process.env.SCAN_DUE_THRESHOLD_HOURS) || 20;
// Generous relative to a single campaign's real observed scan duration
// (10-40s live-measured) and the Vercel Hobby-tier 60s function ceiling —
// long enough that a normal scan never has its own lock expire out from
// under it, short enough that a genuinely crashed process's stale lock
// clears well before the next day's cron run.
const SCAN_LOCK_LEASE_MINUTES = Number(process.env.SCAN_LOCK_LEASE_MINUTES) || 10;
// Preserves the campaign-level concurrency the prior single-file cron
// route already chose (CAMPAIGN_CONCURRENCY = 3) — deliberately NOT
// raised here: each campaign's own scan already runs several provider
// calls at its own internal concurrency (SEARCH_CONCURRENCY /
// X_SEARCH_CONCURRENCY = 3, ANALYSIS_CONCURRENCY = 15), so campaign-level
// concurrency multiplies that, not adds to it — 3 is chosen to avoid
// provider bursts and DB connection pressure, not raised without new
// evidence this deployment's real limits changed.
const CAMPAIGN_CONCURRENCY = Number(process.env.CAMPAIGN_CONCURRENCY) || 3;
// Soft time budget, not a hard requirement: Vercel Hobby tier hard-caps a
// function at 60s regardless of maxDuration. At high campaign counts this
// invocation genuinely cannot reach every due campaign inside that
// ceiling no matter the concurrency — that's a real physical constraint,
// not something to paper over with more concurrency or an unbounded
// Promise.all. Once elapsed time crosses this budget, no NEW campaigns
// are claimed; anything not yet claimed stays due and gets picked up by
// tomorrow's cron (or the next invocation, if this deployment's plan
// allows more than one cron slot). Left comfortably under the 60s ceiling
// so the campaigns already in flight have room to finish cleanly.
const TIME_BUDGET_MS = Number(process.env.DAILY_SCAN_TIME_BUDGET_MS) || 50_000;

export type DailyScanCampaignResult = {
  campaignId: string;
  name: string;
  status: "scanned" | "skipped" | "failed";
  reason?: string;
  conversationsIngested?: number;
  opportunitiesCreated?: number;
};

export type DailyScanSummary = {
  campaignsFound: number;
  campaignsDue: number;
  campaignsScanned: number;
  campaignsSkipped: number;
  campaignsFailed: number;
  conversationsIngested: number;
  opportunitiesCreated: number;
  durationMs: number;
  results: DailyScanCampaignResult[];
  /** true only when this invocation exited immediately because Beta Mode is on — see the top of runDailyScan(). Absent (not just false) on every normal run, so existing consumers of this type are unaffected. */
  betaModeSkipped?: boolean;
};

/** Pure — no I/O — so it's directly unit-testable without a live database. */
export function isCampaignDue(lastScanAt: Date | null, now: Date, thresholdHours: number): boolean {
  if (!lastScanAt) return true;
  const elapsedMs = now.getTime() - lastScanAt.getTime();
  return elapsedMs >= thresholdHours * 60 * 60 * 1000;
}

/**
 * Maps a raw IngestResult (lib/pipeline.ts) to the coarse status persisted
 * on Campaign.lastScanStatus. This is the zero-result-integrity boundary
 * for the daily scan: a legitimate "found nothing new today" must never
 * look like a failure, and a real failure (provider down, misconfigured)
 * must never look like a quiet success.
 *
 * - notConfigured: pipeline.ts's own structural flag (no offer profile, or
 *   the provider reports "not configured") — needs an operator, not a retry.
 * - failed: nothing was even attempted (ingested/duplicates/junk are all
 *   zero) AND there's a real error — the only way that combination happens
 *   is the scan aborting before or during the provider search call itself
 *   (an unhealthy-but-configured provider, or the search request itself
 *   throwing), never from ordinary per-item analysis hiccups.
 * - completed: everything else, including a genuine zero-result scan
 *   (nothing touched, no errors — a legitimate "nothing new today") and a
 *   scan that mostly succeeded but hit a handful of per-conversation
 *   errors (already visible in detail via that scan's own ScanRun row).
 */
export function classifyScanStatus(result: Pick<IngestResult, "notConfigured" | "errors" | "conversationsIngested" | "skippedDuplicates" | "skippedJunk">): "completed" | "failed" | "not_configured" {
  if (result.notConfigured) return "not_configured";
  const touched = result.conversationsIngested + result.skippedDuplicates + result.skippedJunk;
  if (touched === 0 && result.errors.length > 0) return "failed";
  return "completed";
}

/**
 * Atomically claims a campaign for scanning: due-check and lock-acquire in
 * one conditional UPDATE, so there is no read-then-write race window for
 * two overlapping invocations to both believe they won. Returns true only
 * if THIS call actually acquired the claim.
 */
async function claimCampaignForScan(campaignId: string, dueCutoff: Date, leaseCutoff: Date): Promise<boolean> {
  const claim = await prisma.campaign.updateMany({
    where: {
      id: campaignId,
      status: "active",
      OR: [{ lastScanAt: null }, { lastScanAt: { lt: dueCutoff } }],
      AND: [{ OR: [{ scanLockedAt: null }, { scanLockedAt: { lt: leaseCutoff } }] }],
    },
    data: { scanLockedAt: new Date(), lastScanStartedAt: new Date(), lastScanStatus: "running", lastScanError: null },
  });
  return claim.count === 1;
}

async function releaseCampaignLock(campaignId: string, status: "completed" | "failed" | "not_configured", error: string | null): Promise<void> {
  await prisma.campaign
    .update({
      where: { id: campaignId },
      data: { scanLockedAt: null, lastScanStatus: status, lastScanError: error ? error.slice(0, 500) : null },
    })
    .catch((err) => console.error(`[DailyScan] failed to release lock for campaign ${campaignId}:`, err));
}

/**
 * The one entry point app/api/cron/scan-campaigns/route.ts calls. Finds
 * every ACTIVE, non-manual campaign (the database is the sole source of
 * truth — no hardcoded campaign list, works identically for 2 campaigns or
 * 2,000), determines which are actually due, claims and scans each due
 * campaign with bounded concurrency, and returns an honest summary. A
 * failure on one campaign never aborts the batch — each campaign's outcome
 * is recorded independently.
 */
export async function runDailyScan(): Promise<DailyScanSummary> {
  const startedAt = Date.now();
  console.log("[DailyScan] started");

  // Beta Mode (spec: "IntentScout — Beta Mode / Controlled Manual
  // Scanning"): exits immediately, before touching a single campaign row,
  // provider, or AI call, whenever an administrator has beta testing
  // active — controlled scanning during beta happens only through the
  // manual "Run scan" button (lib/actions/conversations.ts), never the
  // automatic cron. This is the ONLY place the daily cron's own behavior
  // changes for Beta Mode; everything below this check — due-checking,
  // claiming, locking, concurrency, failure isolation — is completely
  // untouched and behaves exactly as it always has whenever Beta Mode is
  // off. No campaign's lastScanAt/lastScanStatus/scanLockedAt is touched
  // here, so nothing about existing scan history or due-ness is disturbed
  // by a skip — the moment Beta Mode turns back off, every campaign is
  // exactly as due (or not) as it would have been anyway.
  const betaSettings = await getBetaSettings();
  if (betaSettings.enabled) {
    console.log("[DailyScan] skipped: Beta Mode is active — automatic scanning is paused, manual scans only");
    return {
      campaignsFound: 0,
      campaignsDue: 0,
      campaignsScanned: 0,
      campaignsSkipped: 0,
      campaignsFailed: 0,
      conversationsIngested: 0,
      opportunitiesCreated: 0,
      durationMs: Date.now() - startedAt,
      results: [],
      betaModeSkipped: true,
    };
  }

  // Manual-source campaigns have no adapter to run — never eligible for
  // the automated scan (unchanged from the prior cron route's own filter).
  const candidates = await prisma.campaign.findMany({
    where: { status: "active", sourceType: { not: "manual" } },
    select: { id: true, name: true, sourceType: true, lastScanAt: true, companyId: true },
  });
  console.log(`[DailyScan] active campaigns found: ${candidates.length}`);

  const now = new Date();
  const dueCutoff = new Date(now.getTime() - SCAN_DUE_THRESHOLD_HOURS * 60 * 60 * 1000);
  const leaseCutoff = new Date(now.getTime() - SCAN_LOCK_LEASE_MINUTES * 60 * 1000);

  const dueByTiming = candidates.filter((c) => isCampaignDue(c.lastScanAt, now, SCAN_DUE_THRESHOLD_HOURS));
  const notDue = candidates.filter((c) => !isCampaignDue(c.lastScanAt, now, SCAN_DUE_THRESHOLD_HOURS));
  console.log(`[DailyScan] campaigns due by timing: ${dueByTiming.length}`);

  // Billing gate: a company with no entitled subscription (never
  // subscribed, canceled, unpaid) or that has already exhausted its plan's
  // monthly/trial AI-analysis allowance is skipped entirely this run — the
  // campaign stays "due" and is simply picked up again once the company is
  // entitled again, exactly like a time-budget skip. This deliberately sits
  // here, before claimCampaignForScan, rather than inside
  // runScanForCampaign — see that function's own doc comment on why plan
  // gating must never touch the core scan/claim logic. Cached per company
  // so a company with several campaigns is checked once, not once per
  // campaign.
  const eligibilityCache = new Map<string, boolean>();
  async function companyEligible(companyId: string): Promise<boolean> {
    const cached = eligibilityCache.get(companyId);
    if (cached !== undefined) return cached;
    const eligible = await isCompanyEligibleForScanning(companyId);
    eligibilityCache.set(companyId, eligible);
    return eligible;
  }

  const due: typeof dueByTiming = [];
  const results: DailyScanCampaignResult[] = notDue.map((c) => ({ campaignId: c.id, name: c.name, status: "skipped", reason: "not_due" }));
  for (const c of dueByTiming) {
    if (await companyEligible(c.companyId)) {
      due.push(c);
    } else {
      results.push({ campaignId: c.id, name: c.name, status: "skipped", reason: "plan_limit_reached" });
    }
  }
  console.log(`[DailyScan] campaigns due after billing gate: ${due.length}`);

  let conversationsIngested = 0;
  let opportunitiesCreated = 0;
  let scanned = 0;
  let failed = 0;
  let skippedOther = 0;

  await mapWithConcurrency(due, CAMPAIGN_CONCURRENCY, async (c) => {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      skippedOther += 1;
      results.push({ campaignId: c.id, name: c.name, status: "skipped", reason: "time_budget_exhausted" });
      console.log(`[DailyScan] campaign ${c.id} skipped: time budget exhausted`);
      return;
    }

    const claimed = await claimCampaignForScan(c.id, dueCutoff, leaseCutoff);
    if (!claimed) {
      skippedOther += 1;
      results.push({ campaignId: c.id, name: c.name, status: "skipped", reason: "locked_or_already_scanned" });
      console.log(`[DailyScan] campaign ${c.id} skipped: locked or already claimed by another invocation`);
      return;
    }

    console.log(`[DailyScan] campaign ${c.id} (${c.sourceType}) started`);
    try {
      const result = await runScanForCampaign(c.id);
      conversationsIngested += result.conversationsIngested;
      opportunitiesCreated += result.opportunitiesCreated;

      const scanStatus = classifyScanStatus(result);
      await releaseCampaignLock(c.id, scanStatus, result.errors[0] ?? null);

      if (scanStatus === "completed") {
        scanned += 1;
        console.log(`[DailyScan] campaign ${c.id} ${c.sourceType} completed: found ${result.conversationsIngested} conversation(s), created ${result.opportunitiesCreated} opportunit${result.opportunitiesCreated === 1 ? "y" : "ies"}`);
        results.push({ campaignId: c.id, name: c.name, status: "scanned", conversationsIngested: result.conversationsIngested, opportunitiesCreated: result.opportunitiesCreated });
      } else {
        failed += 1;
        const reason = result.errors[0] ?? scanStatus;
        console.error(`[DailyScan] campaign ${c.id} ${scanStatus}: ${reason}`);
        results.push({ campaignId: c.id, name: c.name, status: "failed", reason });
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Unknown error.";
      await releaseCampaignLock(c.id, "failed", message);
      console.error(`[DailyScan] campaign ${c.id} threw an unhandled error:`, err);
      results.push({ campaignId: c.id, name: c.name, status: "failed", reason: message });
    }
    console.log(`[DailyScan] campaign ${c.id} finished`);
  });

  const summary: DailyScanSummary = {
    campaignsFound: candidates.length,
    campaignsDue: due.length,
    campaignsScanned: scanned,
    campaignsSkipped: notDue.length + (dueByTiming.length - due.length) + skippedOther,
    campaignsFailed: failed,
    conversationsIngested,
    opportunitiesCreated,
    durationMs: Date.now() - startedAt,
    results,
  };
  console.log(
    `[DailyScan] finished: ${JSON.stringify({
      campaignsFound: summary.campaignsFound,
      campaignsDue: summary.campaignsDue,
      campaignsScanned: summary.campaignsScanned,
      campaignsSkipped: summary.campaignsSkipped,
      campaignsFailed: summary.campaignsFailed,
      conversationsIngested: summary.conversationsIngested,
      opportunitiesCreated: summary.opportunitiesCreated,
      durationMs: summary.durationMs,
    })}`,
  );
  return summary;
}
