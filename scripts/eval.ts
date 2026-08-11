/**
 * Runs the real production analysis pipeline (lib/ai/analysis.ts) against a
 * fixture set covering the cases the implementation plan calls for:
 * high/low intent, high-fit/low-intent, low-fit/high-intent, ambiguous,
 * spam, prohibited-promotion, stale, false-positive-risk, and explicit
 * should-return-zero cases. This is the harness for measuring precision
 * and false-positive rate before trusting the scoring in front of a real
 * prospect (implementation plan, Phase 7 / spec section 18).
 *
 * Requires ANTHROPIC_API_KEY. Run with: npm run eval
 */
import { analyzeConversation } from "@/lib/ai/analysis";
import { AiNotConfiguredError } from "@/lib/ai/client";
import { EVAL_CASES } from "./fixtures/conversations";
import { EVAL_OFFER } from "./fixtures/offer";

async function main() {
  console.log(`Running ${EVAL_CASES.length} eval cases against the production analysis pipeline...\n`);

  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  for (const testCase of EVAL_CASES) {
    process.stdout.write(`  ${testCase.id.padEnd(28)} `);
    try {
      const result = await analyzeConversation(testCase.conversation, EVAL_OFFER);
      const gotOpportunity = result !== null;

      let ok = gotOpportunity === testCase.expectOpportunity;
      let detail = gotOpportunity
        ? `is_opportunity=true match=${result!.match_score} intent=${result!.intent_score} fit=${result!.fit_score} safety=${result!.safety_label}`
        : "is_opportunity=false";

      if (ok && testCase.expectSafetyIn && result) {
        const safetyOk = testCase.expectSafetyIn.includes(result.safety_label);
        ok = ok && safetyOk;
        if (!safetyOk) detail += ` [expected safety in ${testCase.expectSafetyIn.join("/")}]`;
      }

      if (ok) {
        pass += 1;
        console.log(`PASS  ${detail}`);
      } else {
        fail += 1;
        const msg = `${testCase.id}: expected opportunity=${testCase.expectOpportunity}, got ${detail} — ${testCase.notes}`;
        failures.push(msg);
        console.log(`FAIL  ${detail}`);
      }
    } catch (err) {
      if (err instanceof AiNotConfiguredError) {
        console.log("SKIP  ANTHROPIC_API_KEY not set");
        continue;
      }
      fail += 1;
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${testCase.id}: threw an error — ${message}`);
      console.log(`ERROR ${message}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed, out of ${EVAL_CASES.length} cases.\n`);
  if (failures.length > 0) {
    console.log("Failures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
