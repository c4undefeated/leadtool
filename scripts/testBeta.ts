/**
 * Deterministic, pure-logic checks for Beta Mode's day-boundary helper
 * (lib/beta.ts's utcDayStart) and the cron-skip contract (lib/dailyScan.ts's
 * DailyScanSummary shape). No network, no database, no Stripe/Gemini/Reddit
 * key needed.
 *
 * What this deliberately does NOT cover (needs a live database — verified
 * separately against the real Supabase project as part of this feature's
 * audit, the same way prior phases of this codebase verified DB-dependent
 * behavior): claimBetaScanAllowance's atomicity under real concurrent
 * requests, refundBetaScanAllowance's floor-at-0 guard, and
 * getAdminBetaOverview's aggregation queries against real ScanRun/
 * BetaScanUsage rows.
 *
 * Run with: npx tsx scripts/testBeta.ts
 */
import { utcDayStart, isManualScanAllowed } from "@/lib/beta";
import { classifyScanStatus } from "@/lib/dailyScan";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(id: string, condition: boolean, detail: string) {
  process.stdout.write(`  ${id.padEnd(70)} `);
  if (condition) {
    pass += 1;
    console.log("PASS");
  } else {
    fail += 1;
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${detail}`);
  }
}

function main() {
  console.log("Running Beta Mode pure-logic checks...\n");

  // --- utcDayStart: the app's one established timezone convention for the daily cap ---
  const mid = new Date("2026-08-19T14:37:22.123Z");
  const truncated = utcDayStart(mid);
  check("utcDayStart: truncates to UTC midnight of the same day", truncated.toISOString() === "2026-08-19T00:00:00.000Z", `got ${truncated.toISOString()}`);

  const justBeforeMidnight = new Date("2026-08-19T23:59:59.999Z");
  check(
    "utcDayStart: 23:59:59.999 UTC stays the same calendar day, not the next",
    utcDayStart(justBeforeMidnight).toISOString() === "2026-08-19T00:00:00.000Z",
    `got ${utcDayStart(justBeforeMidnight).toISOString()}`,
  );

  const justAfterMidnight = new Date("2026-08-20T00:00:00.001Z");
  check(
    "utcDayStart: rolls over to the next day 1ms after UTC midnight",
    utcDayStart(justAfterMidnight).toISOString() === "2026-08-20T00:00:00.000Z",
    `got ${utcDayStart(justAfterMidnight).toISOString()}`,
  );

  const a = utcDayStart(new Date("2026-08-19T00:00:00.000Z"));
  const b = utcDayStart(new Date("2026-08-19T23:59:59.000Z"));
  check("utcDayStart: is idempotent/stable across the whole day (same key for BetaScanUsage's unique constraint)", a.getTime() === b.getTime(), `${a.toISOString()} vs ${b.toISOString()}`);

  // --- isManualScanAllowed: standalone toggle is independent of full Beta Mode ---
  check("manual scan: both off -> not allowed", isManualScanAllowed({ enabled: false, manualScanEnabled: false }) === false, "expected false");
  check("manual scan: full Beta Mode on, standalone off -> allowed", isManualScanAllowed({ enabled: true, manualScanEnabled: false }) === true, "expected true");
  check("manual scan: standalone on, full Beta Mode off -> allowed (cron/billing untouched)", isManualScanAllowed({ enabled: false, manualScanEnabled: true }) === true, "expected true");
  check("manual scan: both on -> allowed", isManualScanAllowed({ enabled: true, manualScanEnabled: true }) === true, "expected true");

  // --- runScanAction's refund decision reuses lib/dailyScan.ts's classifyScanStatus,
  // never a second definition of "did this scan actually run" ---
  const neverConfigured = classifyScanStatus({ notConfigured: true, errors: ["no offer"], conversationsIngested: 0, skippedDuplicates: 0, skippedJunk: 0 });
  check("refund signal: not_configured -> allowance should be refunded", neverConfigured === "not_configured", `got ${neverConfigured}`);

  const searchFailedBeforeTouchingAnything = classifyScanStatus({ notConfigured: false, errors: ["provider down"], conversationsIngested: 0, skippedDuplicates: 0, skippedJunk: 0 });
  check("refund signal: failed (nothing touched, real error) -> allowance should be refunded", searchFailedBeforeTouchingAnything === "failed", `got ${searchFailedBeforeTouchingAnything}`);

  const genuineZero = classifyScanStatus({ notConfigured: false, errors: [], conversationsIngested: 0, skippedDuplicates: 0, skippedJunk: 0 });
  check("refund signal: completed with a genuine zero-result -> allowance should NOT be refunded (a real scan ran)", genuineZero === "completed", `got ${genuineZero}`);

  const realIngestionHappened = classifyScanStatus({ notConfigured: false, errors: ["one item failed"], conversationsIngested: 3, skippedDuplicates: 0, skippedJunk: 0 });
  check(
    "refund signal: real ingestion despite a per-item error -> completed -> allowance should NOT be refunded (provider spend genuinely happened)",
    realIngestionHappened === "completed",
    `got ${realIngestionHappened}`,
  );

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main();
