/**
 * Deterministic, pure-logic checks for lib/dailyScan.ts's due-check
 * (isCampaignDue) and scan-outcome classification (classifyScanStatus).
 * No network, no database, no API key needed.
 *
 * What this deliberately does NOT cover (needs a live database):
 * runDailyScan() end-to-end, the atomic claim/lock (claimCampaignForScan —
 * its correctness under real concurrency depends on Postgres's own atomic
 * UPDATE semantics, not something a pure-logic test can meaningfully fake),
 * campaign discovery/eligibility filtering against real rows, and
 * per-campaign failure isolation against a real runScanForCampaign. Those
 * need live sandbox verification against the actual Supabase project, the
 * same way prior phases of this codebase verified DB-dependent behavior.
 *
 * Run with: npx tsx scripts/testDailyScan.ts
 */
import { isCampaignDue, classifyScanStatus } from "@/lib/dailyScan";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(id: string, condition: boolean, detail: string) {
  process.stdout.write(`  ${id.padEnd(60)} `);
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
  console.log("Running dailyScan pure-logic checks...\n");

  const now = new Date("2026-08-17T18:20:00Z");

  // --- isCampaignDue ---
  check("due: never scanned (null lastScanAt) is always due", isCampaignDue(null, now, 20), "expected true");

  const nineteenHoursAgo = new Date(now.getTime() - 19 * 60 * 60 * 1000);
  check(
    "due: scanned 19h ago, threshold 20h -> not due yet",
    isCampaignDue(nineteenHoursAgo, now, 20) === false,
    "expected false (protects against a same-day double-fire)",
  );

  const twentyOneHoursAgo = new Date(now.getTime() - 21 * 60 * 60 * 1000);
  check(
    "due: scanned 21h ago, threshold 20h -> due",
    isCampaignDue(twentyOneHoursAgo, now, 20) === true,
    "expected true",
  );

  const exactlyThreshold = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  check(
    "due: elapsed exactly equals the threshold -> due (>=, not >)",
    isCampaignDue(exactlyThreshold, now, 20) === true,
    "expected true",
  );

  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  check(
    "due: scanned 1 minute ago -> definitely not due (guards a duplicate cron invocation within the same run)",
    isCampaignDue(oneMinuteAgo, now, 20) === false,
    "expected false",
  );

  // --- classifyScanStatus ---
  check(
    "classify: notConfigured flag always wins regardless of other fields",
    classifyScanStatus({ notConfigured: true, errors: [], conversationsIngested: 5, skippedDuplicates: 0, skippedJunk: 0 }) === "not_configured",
    "expected not_configured",
  );

  check(
    "classify: nothing touched + a real error -> failed (provider/search-level failure, nothing was attempted)",
    classifyScanStatus({ notConfigured: false, errors: ["Redditapis unreachable"], conversationsIngested: 0, skippedDuplicates: 0, skippedJunk: 0 }) === "failed",
    "expected failed",
  );

  check(
    "classify: nothing touched, no errors -> completed (a legitimate zero-result scan, zero-result integrity)",
    classifyScanStatus({ notConfigured: false, errors: [], conversationsIngested: 0, skippedDuplicates: 0, skippedJunk: 0 }) === "completed",
    "expected completed — this must NEVER be misreported as a failure",
  );

  check(
    "classify: real ingestion happened despite a couple of per-item errors -> still completed",
    classifyScanStatus({ notConfigured: false, errors: ["analysis failed for conversation X"], conversationsIngested: 40, skippedDuplicates: 3, skippedJunk: 2 }) === "completed",
    "expected completed — per-item hiccups don't make the whole scan a failure",
  );

  check(
    "classify: only duplicates/junk touched (no new content), no errors -> completed",
    classifyScanStatus({ notConfigured: false, errors: [], conversationsIngested: 0, skippedDuplicates: 4, skippedJunk: 1 }) === "completed",
    "expected completed",
  );

  console.log(`\n${pass} passed, ${fail} failed, out of ${pass + fail} checks.\n`);
  if (failures.length > 0) {
    console.log("Failures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main();
