/**
 * Deterministic, pure-logic checks for lib/sources/searchOrchestrator.ts —
 * precision-query construction (buildBaselineQuery), discovery-term batch
 * packing (packTermBatches), rotation priority (rankTerms), and literal
 * term attribution (matchedTermIds). No network, no database, no API key
 * needed.
 *
 * What this deliberately does NOT cover (needs live keys / a real DB):
 * runDiscovery() end-to-end (calls searchRedditapis and prisma),
 * ensureDiscoveryTerms()/generateDiscoveryTerms() (calls Gemini),
 * DiscoveryTermRun/ScanRun persistence, and cache-hit/budget-exhaustion
 * behavior under real provider responses. Those require live sandbox
 * verification, not this script.
 *
 * Run with: npm run test:search-orchestrator
 */
import { buildBaselineQuery, packTermBatches, rankTerms, matchedTermIds, buildCommunityBonusJobs } from "@/lib/sources/searchOrchestrator";
import type { DiscoveryTerm } from "@prisma/client";
import type { RedditapisPost } from "@/lib/providers/redditapis/service";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(id: string, condition: boolean, detail: string) {
  process.stdout.write(`  ${id.padEnd(50)} `);
  if (condition) {
    pass += 1;
    console.log("PASS");
  } else {
    fail += 1;
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${detail}`);
  }
}

function makeTerm(overrides: Partial<DiscoveryTerm> & { id: string; term: string; priority: string }): DiscoveryTerm {
  return {
    campaignId: "campaign-1",
    category: "problem",
    promptVersion: "discovery-v1-gemini",
    active: true,
    timesUsed: 0,
    lastUsedAt: null,
    candidatesFound: 0,
    opportunitiesFound: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function makePost(overrides: Partial<RedditapisPost> = {}): RedditapisPost {
  return { id: "abc", name: "t3_abc", created_utc: Date.now() / 1000, ...overrides };
}

function main() {
  console.log("Running searchOrchestrator pure-logic checks...\n");

  // --- buildBaselineQuery (precision layer) ---
  const both = buildBaselineQuery(["need a coach"], ["personal trainer"]);
  check(
    "precision: keywords + topics unconditionally OR'd",
    both.includes('"need a coach"') && both.includes('"personal trainer"') && both.includes(" OR ") && !both.includes(" AND "),
    `got: ${both}`,
  );

  const neither = buildBaselineQuery([], []);
  check("precision: no keywords/topics -> empty string", neither === "", `got: "${neither}"`);

  const single = buildBaselineQuery(["personal trainer"], []);
  check("precision: single term has no AND intent-word gate", single === '"personal trainer"', `got: ${single}`);

  // --- packTermBatches ---
  const shortTerms = [
    { id: "a", term: "workout routine" },
    { id: "b", term: "training split" },
    { id: "c", term: "progressive overload" },
  ];
  const onebatch = packTermBatches(shortTerms, 4, 400);
  check(
    "batching: short terms fit in one batch under a generous limit",
    onebatch.length === 1 && onebatch[0]!.termIds.length === 3,
    `got ${onebatch.length} batch(es): ${JSON.stringify(onebatch.map((b) => b.termIds))}`,
  );

  const tightBatches = packTermBatches(shortTerms, 4, 30);
  check(
    "batching: a tight length limit splits into multiple batches",
    tightBatches.length > 1 && tightBatches.every((b) => b.termIds.length >= 1),
    `got ${tightBatches.length} batch(es): ${JSON.stringify(tightBatches.map((b) => b.termIds))}`,
  );
  check(
    "batching: every term still appears exactly once across batches",
    tightBatches.flatMap((b) => b.termIds).sort().join(",") === "a,b,c",
    `got: ${tightBatches.flatMap((b) => b.termIds).join(",")}`,
  );

  const manyTerms = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, term: `concept number ${i}` }));
  const capped = packTermBatches(manyTerms, 2, 30);
  check("batching: maxBatches cap is respected", capped.length <= 2, `got ${capped.length} batches`);

  const oneHugeTerm = [{ id: "huge", term: "a".repeat(100) }];
  const hugeBatch = packTermBatches(oneHugeTerm, 4, 10);
  check(
    "batching: a single term longer than maxLength still gets its own batch, not dropped",
    hugeBatch.length === 1 && hugeBatch[0]!.termIds[0] === "huge",
    `got: ${JSON.stringify(hugeBatch)}`,
  );

  const withBlank = packTermBatches([{ id: "x", term: "  " }, { id: "y", term: "real term" }], 4, 400);
  check(
    "batching: whitespace-only terms are skipped",
    withBlank.length === 1 && withBlank[0]!.termIds.length === 1 && withBlank[0]!.termIds[0] === "y",
    `got: ${JSON.stringify(withBlank)}`,
  );

  // --- rankTerms ---
  const neverUsedHigh = makeTerm({ id: "high-never", term: "x", priority: "high" });
  const usedHigh = makeTerm({ id: "high-used", term: "x", priority: "high", timesUsed: 3, lastUsedAt: new Date() });
  const neverUsedLow = makeTerm({ id: "low-never", term: "x", priority: "low" });
  const ranked1 = rankTerms([neverUsedHigh, usedHigh, neverUsedLow]);
  check(
    "rank: never-used beats same-priority just-used",
    ranked1.findIndex((r) => r.term.id === "high-never") < ranked1.findIndex((r) => r.term.id === "high-used"),
    `order: ${ranked1.map((r) => r.term.id).join(", ")}`,
  );
  check(
    "rank: high priority beats low priority even both never-used",
    ranked1.findIndex((r) => r.term.id === "high-never") < ranked1.findIndex((r) => r.term.id === "low-never"),
    `order: ${ranked1.map((r) => r.term.id).join(", ")}`,
  );

  const blankTerm = makeTerm({ id: "blank", term: "   ", priority: "high" });
  const rankedWithBlank = rankTerms([blankTerm, neverUsedLow]);
  check(
    "rank: terms with no usable text are filtered out entirely",
    rankedWithBlank.every((r) => r.term.id !== "blank") && rankedWithBlank.length === 1,
    `remaining: ${rankedWithBlank.map((r) => r.term.id).join(", ")}`,
  );

  const highYield = makeTerm({
    id: "high-yield",
    term: "x",
    priority: "medium",
    timesUsed: 5,
    lastUsedAt: new Date(),
    candidatesFound: 10,
    opportunitiesFound: 4, // 0.4 ratio * 200 = 80, capped at 40
  });
  const [highYieldRanked] = rankTerms([highYield]);
  check(
    "rank: yieldBonus caps at 40 (base 20 medium + 0 exploration + 40 yield = 60)",
    highYieldRanked!.score === 60,
    `got score=${highYieldRanked!.score}`,
  );

  const belowThreshold = makeTerm({
    id: "below-threshold",
    term: "x",
    priority: "medium",
    timesUsed: 2,
    lastUsedAt: new Date(),
    candidatesFound: 2, // below the 3-candidate minimum -> no yieldBonus regardless of ratio
    opportunitiesFound: 2,
  });
  const [belowRanked] = rankTerms([belowThreshold]);
  check(
    "rank: yieldBonus requires >=3 candidatesFound (score stays at base 20)",
    belowRanked!.score === 20,
    `got score=${belowRanked!.score}`,
  );

  const idleTenDays = makeTerm({
    id: "idle-10d",
    term: "x",
    priority: "medium",
    timesUsed: 1,
    lastUsedAt: new Date(Date.now() - 10 * 86_400_000),
  });
  const [idleRanked] = rankTerms([idleTenDays]);
  check(
    "rank: explorationBonus caps at 30 after long idle (base 20 + 30 = 50)",
    idleRanked!.score === 50,
    `got score=${idleRanked!.score}`,
  );

  // --- matchedTermIds (literal-substring attribution) ---
  const batchTerms = [
    { id: "t1", term: "hybrid workout plans" },
    { id: "t2", term: "training split" },
  ];
  const literalMatch = matchedTermIds(makePost({ title: "Need help with hybrid workout plans for beginners" }), batchTerms);
  check(
    "attribution: literal substring match credits the specific term",
    literalMatch.length === 1 && literalMatch[0] === "t1",
    `got: ${JSON.stringify(literalMatch)}`,
  );

  const caseInsensitive = matchedTermIds(makePost({ text: "What's a good TRAINING SPLIT for a beginner?" }), batchTerms);
  check(
    "attribution: matching is case-insensitive",
    caseInsensitive.length === 1 && caseInsensitive[0] === "t2",
    `got: ${JSON.stringify(caseInsensitive)}`,
  );

  const noMatch = matchedTermIds(makePost({ title: "Something completely unrelated to either phrase" }), batchTerms);
  check(
    "attribution: no literal match falls back to crediting the whole batch",
    noMatch.length === 2 && noMatch.includes("t1") && noMatch.includes("t2"),
    `got: ${JSON.stringify(noMatch)}`,
  );

  // --- buildCommunityBonusJobs (multi-community precision-boost rotation) ---
  const NOW = Date.parse("2026-08-15T12:00:00Z");
  const ONE_DAY = 86_400_000;

  check(
    "community-bonus: zero communities -> no bonus jobs",
    buildCommunityBonusJobs([], "some query", 2, NOW).length === 0,
    "expected empty array",
  );

  check(
    "community-bonus: exactly one community -> no bonus jobs (handled as the single-scope case elsewhere)",
    buildCommunityBonusJobs(["fitness"], "some query", 2, NOW).length === 0,
    "expected empty array",
  );

  check(
    "community-bonus: empty query -> no bonus jobs even with several communities",
    buildCommunityBonusJobs(["fitness", "loseit", "xxfitness"], "", 2, NOW).length === 0,
    "expected empty array",
  );

  check(
    "community-bonus: maxBonusBatches=0 -> no bonus jobs",
    buildCommunityBonusJobs(["fitness", "loseit"], "some query", 0, NOW).length === 0,
    "expected empty array",
  );

  const threeCommunities = ["fitness", "loseit", "xxfitness"];
  const bonus2of3 = buildCommunityBonusJobs(threeCommunities, "workout plan", 2, NOW);
  check(
    "community-bonus: respects maxBonusBatches cap (2 of 3 communities)",
    bonus2of3.length === 2 && bonus2of3.every((j) => threeCommunities.includes(j.subreddit) && j.query === "workout plan"),
    `got: ${JSON.stringify(bonus2of3)}`,
  );
  check(
    "community-bonus: no duplicate subreddits within one scan's bonus batch",
    new Set(bonus2of3.map((j) => j.subreddit)).size === bonus2of3.length,
    `got: ${JSON.stringify(bonus2of3)}`,
  );

  const sameDay = buildCommunityBonusJobs(threeCommunities, "workout plan", 2, NOW + 60_000);
  check(
    "community-bonus: deterministic — same day produces the same selection",
    JSON.stringify(bonus2of3) === JSON.stringify(sameDay),
    `first: ${JSON.stringify(bonus2of3)}, second: ${JSON.stringify(sameDay)}`,
  );

  const nextDay = buildCommunityBonusJobs(threeCommunities, "workout plan", 2, NOW + ONE_DAY);
  check(
    "community-bonus: rotates to a different selection on a different day",
    JSON.stringify(bonus2of3) !== JSON.stringify(nextDay),
    `day1: ${JSON.stringify(bonus2of3)}, day2: ${JSON.stringify(nextDay)}`,
  );

  const dedupedInput = buildCommunityBonusJobs(["fitness", "fitness", "loseit"], "workout plan", 5, NOW);
  check(
    "community-bonus: duplicate community names in input are deduped",
    dedupedInput.length === 2,
    `got: ${JSON.stringify(dedupedInput)}`,
  );

  console.log(`\n${pass} passed, ${fail} failed, out of ${pass + fail} checks.\n`);
  if (failures.length > 0) {
    console.log("Failures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main();
