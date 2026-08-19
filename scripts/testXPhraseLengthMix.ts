/**
 * Live proof that lib/ai/xPhrases.ts's new short/long length-band mix
 * (added to address the X-discovery audit's finding: 9/10 IntentScout
 * query batches built from the old single ~3-9-word band returned zero
 * raw provider results) is genuinely vertical-agnostic across a wide
 * spread of business types, not just the two already covered by
 * scripts/testXPhraseGeneration.ts (fitness, plumbing).
 *
 * For each of 10 synthetic Offer fixtures (scripts/fixtures/offer.ts),
 * asserts:
 *   - a real mix of both length bands exists (not all long, not all short)
 *   - zero single-word phrases (the explicit "marketing"/"leads"/"business"
 *     failure mode called out in the audit)
 *   - each pool stays grounded in its own vertical's vocabulary, with no
 *     hardcoded branching in the generator itself producing that grounding
 *
 * Requires GEMINI_API_KEY (10 real Gemini calls, targetCount=30 each — a
 * deliberately small pool per business to keep this cheap). Gracefully
 * SKIPs if unset, same convention as scripts/eval.ts. Run with:
 *   npx tsx --env-file=.env scripts/testXPhraseLengthMix.ts
 */
import { generateXPhrases } from "@/lib/ai/xPhrases";
import { AiNotConfiguredError } from "@/lib/ai/client";
import type { XPhraseResult } from "@/lib/ai/schemas";
import {
  EVAL_OFFER,
  PLUMBING_OFFER,
  DENTIST_OFFER,
  ACCOUNTANT_OFFER,
  SAAS_LEADGEN_OFFER,
  REAL_ESTATE_OFFER,
  CLEANING_OFFER,
  PHOTOGRAPHER_OFFER,
  LAWYER_OFFER,
  ECOMMERCE_OFFER,
} from "./fixtures/offer";

const TARGET_COUNT = 30;

const VERTICALS: { label: string; offer: typeof EVAL_OFFER; distinctiveWords: string[] }[] = [
  { label: "Fitness coaching", offer: EVAL_OFFER, distinctiveWords: ["strength", "lifting", "coaching", "program"] },
  { label: "Plumbing", offer: PLUMBING_OFFER, distinctiveWords: ["plumb", "pipe", "leak", "drain", "water heater"] },
  { label: "Dentist", offer: DENTIST_OFFER, distinctiveWords: ["dentist", "dental", "tooth", "teeth", "cavity"] },
  { label: "Accountant", offer: ACCOUNTANT_OFFER, distinctiveWords: ["bookkeep", "tax", "accountant", "deduct"] },
  { label: "SaaS/lead-gen", offer: SAAS_LEADGEN_OFFER, distinctiveWords: ["social listening", "buying intent", "cold outreach", "prospect"] },
  { label: "Real estate", offer: REAL_ESTATE_OFFER, distinctiveWords: ["realtor", "listing", "buy a home", "closing", "buyer's agent"] },
  { label: "Cleaning", offer: CLEANING_OFFER, distinctiveWords: ["house cleaner", "maid", "housekeep", "deep clean"] },
  { label: "Photographer", offer: PHOTOGRAPHER_OFFER, distinctiveWords: ["photographer", "wedding photo", "portrait session", "photo shoot"] },
  { label: "Lawyer", offer: LAWYER_OFFER, distinctiveWords: ["divorce", "custody", "family law", "attorney"] },
  { label: "E-commerce", offer: ECOMMERCE_OFFER, distinctiveWords: ["plastic free", "zero waste", "sustainable", "eco-friendly"] },
];

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

function wordCount(phrase: string): number {
  return phrase.trim().split(/\s+/).filter(Boolean).length;
}

async function main() {
  console.log(`Running X phrase length-mix + vertical-agnosticism checks across ${VERTICALS.length} businesses...\n`);

  const results: { label: string; result: XPhraseResult; distinctiveWords: string[] }[] = [];

  for (const v of VERTICALS) {
    let result: XPhraseResult;
    try {
      result = await generateXPhrases(v.offer, TARGET_COUNT);
    } catch (err) {
      if (err instanceof AiNotConfiguredError) {
        console.log("SKIP  GEMINI_API_KEY not set");
        return;
      }
      throw err;
    }
    results.push({ label: v.label, result, distinctiveWords: v.distinctiveWords });

    const phrases = result.phrases;
    const shortBand = phrases.filter((p) => wordCount(p.phrase) <= 4);
    const longBand = phrases.filter((p) => wordCount(p.phrase) >= 5);
    const singleWord = phrases.filter((p) => wordCount(p.phrase) <= 1);

    check(`${v.label}: generated a non-trivial pool`, phrases.length >= 8, `got ${phrases.length}`);
    check(
      `${v.label}: real mix of both length bands (>=15% short, >=15% long)`,
      phrases.length > 0 && shortBand.length / phrases.length >= 0.15 && longBand.length / phrases.length >= 0.15,
      `short=${shortBand.length}/${phrases.length} (${((shortBand.length / Math.max(1, phrases.length)) * 100).toFixed(0)}%), long=${longBand.length}/${phrases.length}`,
    );
    check(`${v.label}: zero single-word phrases`, singleWord.length === 0, `found: [${singleWord.map((p) => `"${p.phrase}"`).join(", ")}]`);

    const text = phrases.map((p) => p.phrase.toLowerCase()).join(" | ");
    const groundedHits = v.distinctiveWords.filter((w) => text.includes(w.toLowerCase()));
    check(
      `${v.label}: pool is actually grounded in its own vertical`,
      groundedHits.length >= 1,
      `matched none of: [${v.distinctiveWords.join(", ")}]`,
    );

    console.log(
      `    short sample: ${shortBand.slice(0, 4).map((p) => `"${p.phrase}"`).join(", ") || "(none)"}\n` +
        `    long sample:  ${longBand.slice(0, 3).map((p) => `"${p.phrase}"`).join(", ") || "(none)"}`,
    );
  }

  // Cross-vertical leakage: every OTHER vertical's distinctive words must not
  // appear in this vertical's pool (mirrors testXPhraseGeneration.ts's
  // fitness<->plumbing leak check, extended to all 10).
  console.log("\nCross-vertical leakage check:");
  for (const r of results) {
    const text = r.result.phrases.map((p) => p.phrase.toLowerCase()).join(" | ");
    const others = VERTICALS.filter((v) => v.label !== r.label);
    const leaked: string[] = [];
    for (const other of others) {
      for (const w of other.distinctiveWords) {
        if (text.includes(w.toLowerCase())) leaked.push(`${w} (from ${other.label})`);
      }
    }
    check(`${r.label}: zero vocabulary leaked from other verticals`, leaked.length === 0, `leaked: [${leaked.join(", ")}]`);
  }

  console.log(`\n${pass} passed, ${fail} failed, out of ${pass + fail} checks.\n`);
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
