/**
 * Deterministic, pure-logic checks for the admin panel's one genuinely
 * pure function: lib/admin/cron.ts's reconstructLatestBatch, which
 * approximates "the latest cron invocation" from ScanRun rows (no single
 * cron-run record is persisted — see that file's doc comment). No
 * network, no database, no API key needed.
 *
 * Everything else new under lib/admin/ is a direct Prisma/Stripe read
 * with no branching logic worth a pure-logic test — those are verified
 * live against Supabase/Stripe instead, the same way prior admin-adjacent
 * work in this codebase was verified.
 *
 * Run with: npx tsx scripts/testAdmin.ts
 */
import { reconstructLatestBatch, type ScanRunHistoryRow } from "@/lib/admin/cron";

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

function row(overrides: Partial<ScanRunHistoryRow> & { startedAt: Date }): ScanRunHistoryRow {
  return {
    id: `run_${Math.random().toString(36).slice(2)}`,
    campaignId: "camp_1",
    campaignName: "Test Campaign",
    companyName: "Test Co",
    sourceType: "reddit",
    durationMs: 5000,
    conversationsIngested: 0,
    opportunitiesCreated: 0,
    providerErrors: 0,
    aiErrors: 0,
    notConfigured: false,
    ...overrides,
  };
}

function main() {
  console.log("Running admin pure-logic checks...\n");

  check("empty history -> null", reconstructLatestBatch([]) === null, "expected null");

  const now = new Date("2026-08-18T18:20:00Z");
  const oneMinAgo = new Date(now.getTime() - 60_000);
  const twoMinAgo = new Date(now.getTime() - 120_000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const sameBatch = [
    row({ startedAt: now, opportunitiesCreated: 2 }),
    row({ startedAt: oneMinAgo, opportunitiesCreated: 1 }),
    row({ startedAt: twoMinAgo, opportunitiesCreated: 3, providerErrors: 1 }),
    row({ startedAt: oneDayAgo, opportunitiesCreated: 99 }), // a much older, unrelated scan — must NOT be included
  ];

  const batch = reconstructLatestBatch(sameBatch);
  check("groups scans started within the batch window", batch !== null && batch.scansAttempted === 3, `expected 3, got ${batch?.scansAttempted}`);
  check(
    "excludes a scan from an entirely different (much older) cron run",
    batch !== null && batch.scansAttempted !== sameBatch.length,
    "the 1-day-old row must not be counted in the latest batch",
  );
  check("sums opportunitiesCreated across just the batched rows", batch?.opportunitiesCreated === 6, `expected 6 (2+1+3), got ${batch?.opportunitiesCreated}`);
  check("counts a row with providerErrors > 0 as failed", batch?.failedCount === 1, `expected 1, got ${batch?.failedCount}`);
  check("windowStart is the earliest row IN the batch, not the oldest row overall", batch?.windowStart.getTime() === twoMinAgo.getTime(), "expected the 2-minutes-ago timestamp");

  const singleRun = [row({ startedAt: now, opportunitiesCreated: 5 })];
  const singleBatch = reconstructLatestBatch(singleRun);
  check("a single scan is its own batch of one", singleBatch?.scansAttempted === 1, `expected 1, got ${singleBatch?.scansAttempted}`);

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main();
