/**
 * Deterministic, pure-logic checks for Intelligent Retrieval Assistance's
 * candidate-selection and name-validation logic
 * (lib/sources/communityDiscovery.ts). No network, no database, no
 * Gemini/Redditapis key needed.
 *
 * What this deliberately does NOT cover (needs a live database and/or a
 * real Gemini/Redditapis account): generateCommunityCandidates's actual AI
 * output, validateSubreddit's real existence check against the provider,
 * ensureCommunityCandidates's staleness bootstrap, and
 * updateCommunityStatsFromScan's auto-pause rule. Those were verified live
 * against the real Supabase project and reported separately.
 *
 * Run with: npx tsx scripts/testCommunityDiscovery.ts
 */
import { selectCandidatesToValidate, isPlausibleSubredditName } from "@/lib/sources/communityDiscovery";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(id: string, condition: boolean, detail: string) {
  process.stdout.write(`  ${id.padEnd(78)} `);
  if (condition) {
    pass += 1;
    console.log("PASS");
  } else {
    fail += 1;
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${detail}`);
  }
}

function candidate(name: string, priority: string) {
  return { name, priority, reasoning: `why ${name}`, relatedConcepts: ["problem"] };
}

function main() {
  console.log("Running community-discovery pure-logic checks...\n");

  // --- isPlausibleSubredditName ---
  check("plausible: ordinary lowercase name", isPlausibleSubredditName("smallbusiness"), "expected true");
  check("plausible: mixed case + underscore + digits", isPlausibleSubredditName("AskPhotography_2"), "expected true");
  check("plausible: rejects a name with a space", !isPlausibleSubredditName("small business"), "expected false");
  check("plausible: rejects an r/-prefixed name (should be stripped upstream)", !isPlausibleSubredditName("r/fitness"), "expected false");
  check("plausible: rejects empty string", !isPlausibleSubredditName(""), "expected false");
  check("plausible: rejects a name over Reddit's 21-char limit", !isPlausibleSubredditName("a".repeat(22)), "expected false");
  check("plausible: accepts exactly 21 chars", isPlausibleSubredditName("a".repeat(21)), "expected true");
  check("plausible: rejects a name with punctuation", !isPlausibleSubredditName("fitness!"), "expected false");

  // --- selectCandidatesToValidate: additive dedup ---
  const generated = [candidate("fitness", "high"), candidate("bodybuilding", "medium"), candidate("loseit", "low")];
  const noneKnownYet = selectCandidatesToValidate(generated, [], 10);
  check("dedup: nothing filtered when the campaign knows nothing yet", noneKnownYet.length === 3, `got ${noneKnownYet.length}`);

  const alreadyManual = selectCandidatesToValidate(generated, ["fitness"], 10);
  check("dedup: a manually-configured community is never re-suggested", !alreadyManual.some((c) => c.name === "fitness"), "fitness should have been filtered out");
  check("dedup: case-insensitive against existing names", selectCandidatesToValidate(generated, ["FITNESS"], 10).every((c) => c.name !== "fitness"), "expected case-insensitive match");

  const withDuplicateInBatch = selectCandidatesToValidate([candidate("fitness", "high"), candidate("fitness", "medium")], [], 10);
  check("dedup: a name repeated within one generation is only kept once", withDuplicateInBatch.length === 1, `got ${withDuplicateInBatch.length}`);

  // --- selectCandidatesToValidate: priority-first ordering under a bounded budget ---
  const mixed = [candidate("low1", "low"), candidate("high1", "high"), candidate("medium1", "medium"), candidate("high2", "high")];
  const boundedToTwo = selectCandidatesToValidate(mixed, [], 2);
  check(
    "priority ordering: high-priority candidates claim the validation budget first",
    boundedToTwo.length === 2 && boundedToTwo.every((c) => c.priority === "high"),
    `got ${JSON.stringify(boundedToTwo.map((c) => c.name))}`,
  );

  const unbounded = selectCandidatesToValidate(mixed, [], 10);
  check(
    "priority ordering: full list still returned in high->medium->low order when budget isn't the constraint",
    unbounded.map((c) => c.priority).join(",") === "high,high,medium,low",
    `got ${unbounded.map((c) => c.priority).join(",")}`,
  );

  check("selectCandidatesToValidate: never returns more than maxToValidate", selectCandidatesToValidate(mixed, [], 1).length === 1, "expected exactly 1");
  check("selectCandidatesToValidate: empty input -> empty output", selectCandidatesToValidate([], [], 10).length === 0, "expected 0");

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main();
