/**
 * Runs isJunkPost (lib/pipeline.ts) against a fixture set covering every
 * documented rule category — deleted/removed markers, the 8-word minimum
 * (including both boundary cases), each spam pattern, the bot/meta marker,
 * case-insensitivity, and near-miss false-positive guards (substrings that
 * must NOT trigger a spam match). No external calls, no API key needed —
 * this is a pure-function check, unlike scripts/eval.ts.
 *
 * Run with: npm run test:junk-filter
 */
import { isJunkPost } from "@/lib/pipeline";
import { JUNK_FILTER_CASES } from "./fixtures/junkPosts";

function main() {
  console.log(`Running ${JUNK_FILTER_CASES.length} junk-filter cases against isJunkPost...\n`);

  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  for (const testCase of JUNK_FILTER_CASES) {
    process.stdout.write(`  ${testCase.id.padEnd(40)} `);
    const result = isJunkPost(testCase.conversation);
    const ok = result.isJunk === testCase.expectJunk;

    if (ok) {
      pass += 1;
      console.log(`PASS  isJunk=${result.isJunk}${result.reason ? ` reason=${result.reason}` : ""}`);
    } else {
      fail += 1;
      const msg = `${testCase.id}: expected isJunk=${testCase.expectJunk}, got isJunk=${result.isJunk} — ${testCase.notes}`;
      failures.push(msg);
      console.log(`FAIL  isJunk=${result.isJunk}${result.reason ? ` reason=${result.reason}` : ""}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed, out of ${JUNK_FILTER_CASES.length} cases.\n`);
  if (failures.length > 0) {
    console.log("Failures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main();
