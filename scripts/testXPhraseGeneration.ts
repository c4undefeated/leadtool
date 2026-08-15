/**
 * Live proof that lib/ai/xPhrases.ts's discovery-phrase generation is
 * genuinely vertical-agnostic — the core requirement of the X/Twitter
 * discovery implementation spec (section 10/14.8): "the production engine
 * must work for fitness, plumbing, roofing, legal... NOT hardcoded fitness
 * examples." Generates a real phrase pool for two completely different
 * businesses (the fitness EVAL_OFFER already used elsewhere in this repo,
 * and a fresh non-fitness PLUMBING_OFFER) from the same prompt and asserts
 * each pool is grounded in ITS OWN business, not leaking the other's
 * vocabulary or producing near-identical output.
 *
 * Requires GEMINI_API_KEY (real Gemini calls — two, roughly the same cost
 * as one discovery-term generation call each). Gracefully SKIPs if unset,
 * same convention as scripts/eval.ts. Run with:
 *   npx tsx --env-file=.env scripts/testXPhraseGeneration.ts
 */
import { generateXPhrases } from "@/lib/ai/xPhrases";
import { AiNotConfiguredError } from "@/lib/ai/client";
import { EVAL_OFFER, PLUMBING_OFFER } from "./fixtures/offer";

const FITNESS_ONLY_WORDS = ["workout", "gym", "muscle", "trainer", "coach", "strength", "lifting", "squat", "deadlift"];
const PLUMBING_ONLY_WORDS = ["plumber", "plumbing", "pipe", "leak", "drain", "faucet", "water heater", "clog"];

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(id: string, condition: boolean, detail: string) {
  process.stdout.write(`  ${id.padEnd(55)} `);
  if (condition) {
    pass += 1;
    console.log("PASS");
  } else {
    fail += 1;
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${detail}`);
  }
}

async function main() {
  console.log("Running X phrase generation vertical-agnosticism checks...\n");

  let fitness: Awaited<ReturnType<typeof generateXPhrases>>;
  let plumbing: Awaited<ReturnType<typeof generateXPhrases>>;
  try {
    [fitness, plumbing] = await Promise.all([generateXPhrases(EVAL_OFFER, 40), generateXPhrases(PLUMBING_OFFER, 40)]);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      console.log("SKIP  GEMINI_API_KEY not set");
      return;
    }
    throw err;
  }

  const fitnessText = fitness.phrases.map((p) => p.phrase.toLowerCase()).join(" | ");
  const plumbingText = plumbing.phrases.map((p) => p.phrase.toLowerCase()).join(" | ");

  check("fitness pool: generated a non-trivial number of phrases", fitness.phrases.length >= 10, `got ${fitness.phrases.length}`);
  check("plumbing pool: generated a non-trivial number of phrases", plumbing.phrases.length >= 10, `got ${plumbing.phrases.length}`);

  const leakedIntoPlumbing = FITNESS_ONLY_WORDS.filter((w) => plumbingText.includes(w));
  check(
    "plumbing pool contains zero fitness-only vocabulary",
    leakedIntoPlumbing.length === 0,
    `leaked: [${leakedIntoPlumbing.join(", ")}] — the generator is bleeding fitness vocabulary into an unrelated business`,
  );

  const leakedIntoFitness = PLUMBING_ONLY_WORDS.filter((w) => fitnessText.includes(w));
  check(
    "fitness pool contains zero plumbing-only vocabulary",
    leakedIntoFitness.length === 0,
    `leaked: [${leakedIntoFitness.join(", ")}] — the generator is bleeding plumbing vocabulary into an unrelated business`,
  );

  const plumbingHits = PLUMBING_ONLY_WORDS.filter((w) => plumbingText.includes(w));
  check(
    "plumbing pool is actually grounded in plumbing (contains real plumbing vocabulary)",
    plumbingHits.length >= 2,
    `only matched: [${plumbingHits.join(", ")}] out of [${PLUMBING_ONLY_WORDS.join(", ")}]`,
  );

  const fitnessSet = new Set(fitness.phrases.map((p) => p.phrase.toLowerCase().trim()));
  const plumbingSet = new Set(plumbing.phrases.map((p) => p.phrase.toLowerCase().trim()));
  const overlap = [...fitnessSet].filter((p) => plumbingSet.has(p));
  check(
    "the two pools are substantially different, not near-duplicate output",
    overlap.length <= Math.max(2, Math.floor(Math.min(fitnessSet.size, plumbingSet.size) * 0.1)),
    `${overlap.length} identical phrase(s) shared between two unrelated businesses: [${overlap.slice(0, 5).join(", ")}]`,
  );

  console.log(`\nSample fitness phrases: ${fitness.phrases.slice(0, 5).map((p) => `"${p.phrase}"`).join(", ")}`);
  console.log(`Sample plumbing phrases: ${plumbing.phrases.slice(0, 5).map((p) => `"${p.phrase}"`).join(", ")}`);

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
