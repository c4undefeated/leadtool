/**
 * Deterministic, pure-logic checks for lib/sources/searchOrchestrator.ts —
 * query construction (buildBaselineQuery, buildSurfaceQuery) and rotation
 * priority (rankSurfaces). No network, no database, no API key needed.
 *
 * What this deliberately does NOT cover (needs live keys / a real DB, per
 * spec section 50): runDiscovery() end-to-end (calls searchRedditapis and
 * prisma), ensureSearchSurfaces()/generateSearchSurfaces() (calls Gemini),
 * SearchSurfaceRun/ScanRun persistence, and cache-hit/budget-exhaustion
 * behavior under real provider responses. Those require the live sandbox
 * verification called out in the final report, not this script.
 *
 * Run with: npm run test:search-orchestrator
 */
import { buildBaselineQuery, buildSurfaceQuery, rankSurfaces } from "@/lib/sources/searchOrchestrator";
import type { SearchSurface } from "@prisma/client";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(id: string, condition: boolean, detail: string) {
  process.stdout.write(`  ${id.padEnd(45)} `);
  if (condition) {
    pass += 1;
    console.log("PASS");
  } else {
    fail += 1;
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${detail}`);
  }
}

function makeSurface(overrides: Partial<SearchSurface> & { family: string; phrases: string }): SearchSurface {
  return {
    id: overrides.id ?? `surface-${overrides.family}`,
    campaignId: "campaign-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    timesRun: 0,
    lastRunAt: null,
    conversationsFound: 0,
    opportunitiesFound: 0,
    ...overrides,
  };
}

function main() {
  console.log("Running searchOrchestrator pure-logic checks...\n");

  // --- buildBaselineQuery ---
  const both = buildBaselineQuery(["need a coach"], ["personal trainer"]);
  check(
    "baseline: topics + keywords combined with OR",
    both.includes('"need a coach"') && both.includes('"personal trainer"') && both.includes(" OR "),
    `got: ${both}`,
  );

  const keywordsOnly = buildBaselineQuery(["need a coach"], []);
  check(
    "baseline: keywords-only has no intent-word AND",
    keywordsOnly === '"need a coach"',
    `got: ${keywordsOnly}`,
  );

  const topicsOnly = buildBaselineQuery([], ["personal trainer"]);
  check(
    "baseline: topics-only ANDs with intent vocabulary",
    topicsOnly.includes('"personal trainer"') && topicsOnly.includes(" AND ") && topicsOnly.includes("looking"),
    `got: ${topicsOnly}`,
  );

  const neither = buildBaselineQuery([], []);
  check("baseline: no keywords/topics -> empty string", neither === "", `got: "${neither}"`);

  // --- buildSurfaceQuery ---
  const domainTopic = buildSurfaceQuery("domain_topic", ["yoga"]);
  check(
    "surface: domain_topic ANDs with intent vocabulary",
    domainTopic.includes('"yoga"') && domainTopic.includes(" AND ") && domainTopic.includes("looking"),
    `got: ${domainTopic}`,
  );

  const buyerRequest = buildSurfaceQuery("buyer_request", ["looking for a plumber"]);
  check(
    "surface: non-domain_topic family has no extra AND",
    buyerRequest === '"looking for a plumber"',
    `got: ${buyerRequest}`,
  );

  const emptyPhrases = buildSurfaceQuery("problem", []);
  check("surface: empty phrase list -> empty string", emptyPhrases === "", `got: "${emptyPhrases}"`);

  // --- rankSurfaces ---
  const neverRunBuyer = makeSurface({ id: "buyer-never", family: "buyer_request", phrases: JSON.stringify(["x"]) });
  const ranRecentlyBuyer = makeSurface({
    id: "buyer-recent",
    family: "buyer_request",
    phrases: JSON.stringify(["x"]),
    timesRun: 3,
    lastRunAt: new Date(),
  });
  const neverRunTroubleshooting = makeSurface({
    id: "trouble-never",
    family: "troubleshooting",
    phrases: JSON.stringify(["x"]),
  });
  const ranked1 = rankSurfaces([neverRunBuyer, ranRecentlyBuyer, neverRunTroubleshooting], false);
  check(
    "rank: never-run beats same-family just-run",
    ranked1.findIndex((r) => r.surface.id === "buyer-never") < ranked1.findIndex((r) => r.surface.id === "buyer-recent"),
    `order: ${ranked1.map((r) => r.surface.id).join(", ")}`,
  );
  check(
    "rank: high base tier beats low tier even both never-run",
    ranked1.findIndex((r) => r.surface.id === "buyer-never") < ranked1.findIndex((r) => r.surface.id === "trouble-never"),
    `order: ${ranked1.map((r) => r.surface.id).join(", ")}`,
  );

  const localNoGeo = makeSurface({ id: "local", family: "local", phrases: JSON.stringify(["near me"]) });
  const [localRankedNoGeo] = rankSurfaces([localNoGeo], false);
  const [localRankedWithGeo] = rankSurfaces([localNoGeo], true);
  check(
    "rank: local promoted to problem tier only when hasGeography",
    localRankedWithGeo!.score > localRankedNoGeo!.score,
    `no-geo score=${localRankedNoGeo!.score}, with-geo score=${localRankedWithGeo!.score}`,
  );

  const emptyPhraseSurface = makeSurface({ id: "empty", family: "problem", phrases: JSON.stringify([]) });
  const rankedWithEmpty = rankSurfaces([emptyPhraseSurface, neverRunBuyer], false);
  check(
    "rank: surfaces with zero usable phrases are filtered out entirely",
    rankedWithEmpty.every((r) => r.surface.id !== "empty") && rankedWithEmpty.length === 1,
    `remaining: ${rankedWithEmpty.map((r) => r.surface.id).join(", ")}`,
  );

  const highYield = makeSurface({
    id: "high-yield",
    family: "problem",
    phrases: JSON.stringify(["x"]),
    timesRun: 5,
    lastRunAt: new Date(),
    conversationsFound: 10,
    opportunitiesFound: 4, // 0.4 ratio * 200 = 80, capped at 40
  });
  const [highYieldRanked] = rankSurfaces([highYield], false);
  check(
    "rank: yieldBonus caps at 40 (base 60 + 0 exploration + 40 yield = 100)",
    highYieldRanked!.score === 100,
    `got score=${highYieldRanked!.score}`,
  );

  const belowYieldThreshold = makeSurface({
    id: "below-threshold",
    family: "problem",
    phrases: JSON.stringify(["x"]),
    timesRun: 2,
    lastRunAt: new Date(),
    conversationsFound: 2, // below the 3-hit minimum -> no yieldBonus regardless of ratio
    opportunitiesFound: 2,
  });
  const [belowThresholdRanked] = rankSurfaces([belowYieldThreshold], false);
  check(
    "rank: yieldBonus requires >=3 conversationsFound (score stays at base 60)",
    belowThresholdRanked!.score === 60,
    `got score=${belowThresholdRanked!.score}`,
  );

  const idleTenDays = makeSurface({
    id: "idle-10d",
    family: "problem",
    phrases: JSON.stringify(["x"]),
    timesRun: 1,
    lastRunAt: new Date(Date.now() - 10 * 86_400_000),
  });
  const [idleRanked] = rankSurfaces([idleTenDays], false);
  check(
    "rank: explorationBonus caps at 30 after long idle (base 60 + 30 = 90)",
    idleRanked!.score === 90,
    `got score=${idleRanked!.score}`,
  );

  console.log(`\n${pass} passed, ${fail} failed, out of ${pass + fail} checks.\n`);
  if (failures.length > 0) {
    console.log("Failures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main();
