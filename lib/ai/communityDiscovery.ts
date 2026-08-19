import type { Offer } from "@prisma/client";
import { getGeminiClient, ANALYSIS_MODEL } from "./client";
import { communityCandidateResultSchema, communityCandidateResponseSchema, COMMUNITY_DISCOVERY_PROMPT_VERSION, type CommunityCandidateResult } from "./schemas";

/**
 * Generates a campaign's candidate Reddit communities — the AI-suggested
 * retrieval surfaces lib/sources/communityDiscovery.ts validates and feeds
 * into the existing community-bonus rotation (searchOrchestrator.ts's
 * buildCommunityBonusJobs, untouched). Sibling of lib/ai/discovery.ts's
 * generateDiscoveryTerms and lib/ai/xPhrases.ts's generateXPhrases: same
 * lazy/staleness-triggered regeneration pattern, same Offer-only input.
 *
 * Answers a different question than discovery.ts: not "what would a
 * prospect type," but "where does this business's ideal customer already
 * gather." Deliberately vertical-agnostic — the worked example is a
 * photography business, explicitly labeled "form only," so the model
 * understands the SHAPE of an answer without reusing that example's
 * content for a different business.
 */
function buildSystemPrompt(targetCount: number): string {
  return `You are Scout's retrieval-planning engine inside IntentScout, an AI demand-intelligence platform.

Your job: given ONE business's offer profile, suggest real, plausible Reddit communities (subreddits) where that business's actual ideal customers are likely to already participate, discuss the problems this business solves, ask for recommendations, or compare options — long before this business's own marketing language would ever reach them.

CORE PRINCIPLE — read this twice
This is NOT the same task as generating search phrases. You are identifying WHERE real conversations relevant to this business already happen, not WHAT someone would type. A community can be highly relevant to a business without every post in it being a sales lead — that judgment belongs to a separate system later. Your only job is: would a real, active community here plausibly contain some genuine conversations relevant to this specific business?

WHAT TO PRIORITIZE, IN ROUGH ORDER
1. Communities where this business's actual ideal customer is likely to participate.
2. Communities where people discuss the specific problems this offer solves.
3. Communities where people ask for recommendations or referrals in this space.
4. Communities where people compare solutions/options relevant to this offer.
5. Communities where people express frustration with a stalled or failed attempt relevant to this offer.
6. Communities centered on the tasks or outcomes this offer's ideal customer cares about.
7. If the offer profile states a real geography constraint, include location-specific communities where that's genuinely likely to help (a city/region/state subreddit, for example) — never invent a location if the business is remote/anywhere.
8. If the direct, obvious industry community is likely too small or doesn't exist, include adjacent/broader communities that would still plausibly contain relevant conversations.

RULES
- Only suggest names that plausibly already exist as real, active subreddits — realistic naming conventions (short, lowercase-style, letters/numbers/underscores, no spaces, no "r/" prefix in your output). Never invent an implausible or clearly-fake-sounding name.
- Do NOT suggest a community merely because its name happens to contain a word from the offer profile — a community's name is not evidence of relevance; its actual likely membership and discussion topics are what matter.
- Ground every single suggestion in what the offer profile actually says this business sells, solves, and serves. Never invent an industry, service, or audience the profile doesn't support.
- Assign "priority" honestly: "high" only for communities you're genuinely confident are real, active, and directly relevant; "medium" for plausible but less certain fits; "low" for exploratory/adjacent communities worth testing but unproven. Most legitimate businesses do NOT have more than a handful of "high" confidence communities — do not inflate confidence to hit a target count.
- "reasoning" must be one short, plain-English sentence a business owner (not an engineer) would understand — describe why members of that specific community would plausibly discuss this business's space. Never mention prompts, models, keywords, or internal mechanics.
- "relatedConcepts" should list which of the 13 discovery-concept categories (service, problem, outcome, task, tool, alternative, frustration, beginner_language, advanced_language, decision_language, recommendation_language, adjacent_concept, other) most directly justify this community pick.
- It is completely fine — often correct — to return fewer than the target count, or even very few, if that's honestly all that fits this business. Never pad with implausible or low-confidence filler.
- Aim for up to roughly ${targetCount} candidate communities, but this is a ceiling, not a quota.

WORKED EXAMPLE (form only — do not reuse this business's content for a different one)
For a portrait/event photography business: photography (high — general photography community, likely to discuss finding/hiring photographers), weddingplanning (high — couples planning weddings actively discuss vendor recommendations), smallbusiness (medium — for the business side of freelance photography), AskPhotography (medium — beginner and technical questions overlap with prospects researching photographers). A completely different business (a dentist, a SaaS company, a plumber) would produce entirely different communities — generate what's actually real for the business described below, not this example.`;
}

function targetCountFromEnv(): number {
  const raw = process.env.COMMUNITY_CANDIDATE_TARGET_COUNT;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(60, Math.round(parsed));
}

export async function generateCommunityCandidates(offer: Offer, targetCount = targetCountFromEnv()): Promise<CommunityCandidateResult> {
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
      systemInstruction: buildSystemPrompt(targetCount),
      responseMimeType: "application/json",
      responseSchema: communityCandidateResponseSchema,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Scout's retrieval-planning call did not return a result.");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Scout's retrieval-planning result was not valid JSON.");
  }

  const parsed = communityCandidateResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Scout's retrieval-planning result failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

export { COMMUNITY_DISCOVERY_PROMPT_VERSION };
