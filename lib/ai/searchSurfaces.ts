import type { Offer } from "@prisma/client";
import { getGeminiClient, ANALYSIS_MODEL } from "./client";
import { searchSurfaceResultSchema, searchSurfaceResponseSchema, type SearchSurfaceResult } from "./schemas";

/**
 * Generates the discovery-angle phrase sets a campaign's scans rotate
 * through (lib/sources/searchOrchestrator.ts). Runs once per campaign —
 * called lazily from runScanForCampaign the first time a campaign has no
 * SearchSurface rows yet, not regenerated every scan.
 *
 * This is deliberately vertical-agnostic: every family definition below is
 * generic, and the only fitness-specific text in this whole prompt is the
 * one worked example, included purely so the model understands the FORM an
 * answer should take (short, real, non-marketing phrases) — never as a
 * default to fall back on for a different business. A dentist, a lawyer, a
 * SaaS company, and a fitness coach should get four completely different,
 * equally real phrase sets from the same prompt.
 */
function buildSystemPrompt(): string {
  return `You are Scout's discovery-planning engine inside IntentScout, an AI demand-intelligence platform.

Your job: given ONE business's offer profile, generate short phrase sets for up to 15 different "discovery angles" — different ways a real prospect for THIS SPECIFIC business might phrase themselves in a public forum post, long before they ever use this business's own marketing language.

CORE PRINCIPLE
The retrieval keyword and the final buying intent do not need to be identical. A prospect rarely writes in the business's own terminology. Your job is to imagine the many different, ordinary ways a real person with a real need in this business's space might actually write a sentence — not to write marketing copy, and not to require them to name what they need using the business's own words.

THE 15 DISCOVERY ANGLES (families)
- buyer_request: a direct ask for exactly this kind of help ("need a [x]", "looking for a [x]").
- provider_search: looking to hire/engage a specific kind of provider or professional.
- recommendation: asking the community for recommendations or referrals.
- problem: describing a specific, personal, current problem in this space.
- solution: naming what kind of solution/approach/service would help.
- goal: describing what outcome they're trying to reach.
- planning: asking how to plan, structure, or get started.
- comparison: weighing multiple specific options against each other.
- alternative: asking for alternatives to something they already tried or a named competitor.
- troubleshooting: something isn't working and they want it fixed.
- dissatisfaction: frustrated or unhappy with a current provider/solution/approach.
- urgency: time pressure — a deadline, an upcoming event, "before X happens."
- beginner_confusion: new to this entirely, doesn't know where to start.
- domain_topic: short, bare topic/subject nouns for this business's space — no inherent intent signal on their own, meant to be combined with generic buying-intent words downstream (so keep these especially short: 1-3 words).
- local: only if this business has a real geographic constraint (see below) — short location-qualified phrases.

RULES
- Ground every phrase in what the offer profile actually says this business sells and solves. Never invent an industry, service, or audience the profile doesn't support.
- Every phrase: short — 2-5 words (domain_topic: 1-3 words). Long, specific sentences essentially never appear verbatim in real posts; short, ordinary phrases do. This is a hard requirement, not a style preference.
- Phrases must be things a real prospect would actually type — plain, ordinary language, not the business's own marketing/brand vocabulary.
- The "local" family: only generate phrases if the offer profile states a real geography constraint. If the business is remote/anywhere, return an EMPTY array for "local" — do not invent a location.
- If a family genuinely doesn't apply to this business, return an empty phrases array for it rather than forcing something that doesn't fit. An empty array is an honest answer, not a failure.
- Never pad with generic filler to hit a target count. 2-3 good phrases beats 8 forced ones.
- Return every one of the 15 families in your response (empty phrases array where nothing fits) — the caller expects a complete set even when some are empty.

WORKED EXAMPLE (form only — do not reuse fitness content for a different business)
For a 1:1 online strength coaching business, "problem" might include: "don't know what to do", "stuck with my progress" — while "domain_topic" might include: "workout routine", "strength training". A dentist's business would produce entirely different phrases across the same 15 angles — e.g. "problem" might include "tooth pain won't stop", "domain_topic" might include "root canal", "teeth whitening". Generate what's actually real for the business described below, not these examples.`;
}

export async function generateSearchSurfaces(offer: Offer): Promise<SearchSurfaceResult> {
  const client = getGeminiClient();

  const userContent = [
    `Business type: ${offer.businessType || "(not specified)"}`,
    `What they sell: ${offer.whatYouSell}`,
    `Problems they solve: ${offer.problemsSolved || "(not specified)"}`,
    `Ideal customer: ${offer.idealCustomer}`,
    `Geography constraint: ${offer.geography || "none — remote/anywhere is fine"}`,
    `Explicitly excluded audiences: ${offer.excludedAudiences || "none stated"}`,
  ].join("\n");

  const response = await client.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: userContent,
    config: {
      systemInstruction: buildSystemPrompt(),
      responseMimeType: "application/json",
      responseSchema: searchSurfaceResponseSchema,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Scout's discovery-planning call did not return a result.");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Scout's discovery-planning result was not valid JSON.");
  }

  const parsed = searchSurfaceResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Scout's discovery-planning result failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
