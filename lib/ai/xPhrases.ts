import type { Offer } from "@prisma/client";
import { getGeminiClient, ANALYSIS_MODEL } from "./client";
import { xPhraseResultSchema, xPhraseResponseSchema, X_PHRASE_PROMPT_VERSION, type XPhraseResult } from "./schemas";

/**
 * Generates a campaign's X/Twitter discovery-phrase pool — the
 * individually-tracked NATURAL, CONVERSATIONAL phrases
 * lib/sources/searchOrchestrator.ts's runXDiscovery rotates through.
 * Sibling of lib/ai/discovery.ts's generateDiscoveryTerms (same lazy/
 * staleness-triggered regeneration pattern, same Offer-only input, same
 * "aim for ~N" prompt lever instead of a schema-level array cap), but
 * X-specific: X is a conversational medium, so its discovery vocabulary
 * leans into full buyer-voice phrase fragments rather than Reddit's
 * shorter topic-concept style.
 *
 * IMPORTANT engineering note on phrase length: these phrases are still
 * quoted and OR-batched into TwitterAPIs' search query exactly like
 * DiscoveryTerm's short concepts are (see packTermBatches in
 * searchOrchestrator.ts) — there is no evidence TwitterAPIs' documented
 * search endpoint does anything other than literal/substring-style
 * matching on quoted text (the same assumption DiscoveryTerm's own prompt
 * already makes explicit: "long, specific sentences essentially never
 * appear verbatim in real posts; short, ordinary phrases do"). A full
 * 12-15 word literary sentence quoted as an exact phrase would almost
 * never match a real tweet and would quietly gut recall to near zero —
 * the opposite of the goal. Live production evidence (an X-discovery
 * audit against IntentScout's own campaign) confirmed this concretely: 9
 * of 10 query batches built from this pool's original single-band ~3-9
 * word guidance returned zero raw results. So this generator now asks for
 * TWO length bands in the SAME pool — a short (~2-4 word) X-native concept
 * band, still multi-word and specific, alongside the original longer
 * (~5-9 word) natural-register band — rather than one length trying to
 * serve both "sounds natural" and "plausibly matches literally" at once.
 * Both bands are ordinary XDiscoveryPhrase rows; nothing downstream
 * (ranking, batching, attribution) treats them differently.
 *
 * Deliberately vertical-agnostic: every category and instruction below is
 * generic, and the one worked example is explicitly labeled "form only" so
 * the model understands the SHAPE of an answer without reusing that
 * example's content for a different business.
 */
function buildSystemPrompt(targetCount: number): string {
  return `You are Scout's X/Twitter discovery-planning engine inside IntentScout, an AI demand-intelligence platform.

Your job: given ONE business's offer profile, generate a large pool of natural, conversational SEARCH PHRASES — short fragments of real speech a real prospect might actually type in a tweet, long before they'd ever use this business's own marketing language.

CORE PRINCIPLE — read this twice
X/Twitter is a conversational medium. People express problems, goals, and frustrations in natural sentence fragments, not search-engine-style keywords. A phrase here should read like something a real person would actually type — "trying to figure out X", "no idea how to deal with X", "does anyone actually know a good X" — not a clinical topic label like "X service". At the same time, every phrase must stay short: a long, fully-formed sentence essentially never appears verbatim inside a real tweet, so a phrase that's too long to plausibly occur as a literal fragment of real text is retrieval-useless no matter how natural it sounds. The goal is natural REGISTER within a short, realistic length — not maximal length.

TWO LENGTH BANDS — generate BOTH, not just one
The search provider matches phrases as literal quoted fragments, so length directly determines whether a phrase can ever actually match real text. Produce a genuine mix of both bands across the categories below, not one band dominating:
- SHORT band (roughly 2-4 words): a concise, X-native concept phrase — still multi-word and specific to this business, never a single bare word ("marketing", "leads", "business" are USELESS — too generic to mean anything on their own). Think "lead generation," "buying intent," "social listening," "cold outreach," "burst pipe repair," "root canal pain" — short enough to plausibly sit verbatim inside almost any real tweet on the topic, however that tweet is phrased.
- LONG band (roughly 5-9 words): the fuller natural conversational fragment — "trying to figure out X", "no idea how to deal with X", "does anyone actually know a good X". More natural-sounding, but only matches a real tweet that happens to use nearly that exact wording.
Aim for roughly an even split between the two bands overall, and include at least one short-band phrase in most of the categories below where a genuine short concept exists for this business — don't concentrate all short phrases in one or two categories.

THE 11 CATEGORIES (rotation classes)
- direct_demand: an explicit, conversational statement of wanting/needing this kind of help — phrased the way someone would actually say it, not a formal request.
- recommendation: asking a community for recommendations or referrals.
- problem: a specific, personal, current problem in this business's space, phrased the way someone experiencing it would actually write it.
- outcome: expressing the goal/result they're trying to reach, independent of how they'd get there.
- solution_seeking: asking how to solve, fix, or accomplish something.
- alternative: asking about alternatives to a specific approach, tool, or named competitor.
- comparison: weighing multiple specific options, decision-stage.
- frustration: venting about a stalled or failed attempt — no explicit ask required.
- tool_product_service: mentioning or asking about a tool, product, or service related to solving this.
- adjacent_concept: a related topic or workflow people with this need also discuss, not the service itself.
- customer_language: how this business's actual ideal customer would casually describe their own situation, in their own words — never the business's marketing language.

RULES
- Every phrase must be a REALISTIC, NATURAL fragment in one of the two length bands above — not a full formal sentence, and never a single bare word. Think "what would this person actually type, or what short concept would this person's tweet actually contain," not "what's the search term."
- A short-band phrase must still be specific and multi-word — a real, meaningful concept in this business's own language, not a generic category word. If you can't produce a genuinely specific short phrase for a category, skip the short band there rather than forcing something generic.
- Do NOT require every phrase to contain an obvious buying-intent word ("looking for", "need", "hire", "recommend"). Most should not — the language BEFORE someone knows exactly what they want to buy ("can't get X working", "no idea where to start with X") is just as valuable, often more so, because it's less competitive and far more common.
- Ground every phrase in what the offer profile actually says this business sells and solves. Never invent an industry, service, or audience the profile doesn't support.
- Vary sentence structure, tone, and register — do not produce many phrases that all start the same way.
- If the offer profile states a real geography constraint, include a modest number of location-qualified phrases naturally, spread across whatever categories they naturally fit. If the business is remote/anywhere, do not invent a location.
- Never pad with generic filler to hit a target count. Real, specific, well-grounded phrases beat forced ones — it is fine to return fewer than the target if that's honestly all that fits this business.
- Assign "priority" honestly per phrase: "high" for phrases you're confident will surface real, actionable prospects; "medium" for plausible but less certain ones; "low" for exploratory/adjacent ones worth testing but unproven.
- Aim for roughly ${targetCount} total phrases across all categories and BOTH length bands combined, but this is a target, not a quota.

WORKED EXAMPLE (form only — do not reuse this business's content for a different one)
For a bookkeeping cleanup service: direct_demand might include the long-band "does anyone know a good bookkeeper" and the short-band "bookkeeping cleanup"; problem might include the long-band "my books have been a mess for months" and the short-band "messy books"; frustration might include "so tired of trying to do my own bookkeeping"; solution_seeking might include "how do people actually stay on top of this"; adjacent_concept might include the long-band "any tips for getting ready for tax season" and the short-band "tax season prep". A completely different business (a plumber, a SaaS company, a personal trainer) would produce entirely different phrases in both bands across the same 11 categories — generate what's actually real for the business described below, not this example.`;
}

function targetCountFromEnv(): number {
  const raw = process.env.X_PHRASE_TARGET_COUNT;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 80;
  return Math.min(300, Math.round(parsed));
}

export async function generateXPhrases(offer: Offer, targetCount = targetCountFromEnv()): Promise<XPhraseResult> {
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
      responseSchema: xPhraseResponseSchema,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Scout's X discovery-planning call did not return a result.");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Scout's X discovery-planning result was not valid JSON.");
  }

  const parsed = xPhraseResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Scout's X discovery-planning result failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

export { X_PHRASE_PROMPT_VERSION };
