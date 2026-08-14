import { createHash } from "crypto";
import type { Offer } from "@prisma/client";
import { getGeminiClient, ANALYSIS_MODEL } from "./client";
import { discoveryTermResultSchema, discoveryTermResponseSchema, DISCOVERY_PROMPT_VERSION, type DiscoveryTermResult } from "./schemas";

/**
 * Generates a campaign's discovery-term pool — the individually-tracked
 * concepts lib/sources/searchOrchestrator.ts rotates through. Runs lazily
 * (see ensureDiscoveryTerms in searchOrchestrator.ts): the first time a
 * campaign has no active terms, or when the offer has materially changed,
 * or when this prompt version has moved on — never regenerated every scan.
 *
 * This is deliberately vertical-agnostic: every category definition below
 * is generic, and the one worked example is explicitly labeled "form only"
 * so the model understands the SHAPE an answer should take (short, ordinary,
 * non-marketing phrases) without ever reusing that example's content for a
 * different business.
 */
function buildSystemPrompt(targetCount: number): string {
  return `You are Scout's discovery-planning engine inside IntentScout, an AI demand-intelligence platform.

Your job: given ONE business's offer profile, generate a large pool of short discovery concepts — the different, ordinary ways a real prospect for THIS SPECIFIC business might phrase themselves in a public forum post, long before they ever use this business's own marketing language.

CORE PRINCIPLE — read this twice
The search concept and the final buying intent are NOT the same thing, and do not need to look alike. A prospect almost never writes in the business's own terminology. Your job is to find THE LANGUAGE OF THE PROBLEM, not the name of the service. A person with a real, current need this business could solve will very often describe their problem, their goal, or a tool/task they're stuck on — without ever saying anything that sounds like "looking for" or "need a" or naming this business's category at all. The retrieved post's own text is what will later be judged for buying intent (by a separate system) — your job here is only to imagine the many realistic ways that post could be phrased, including ones with no obvious buying signal in the phrase itself.

THE 13 CATEGORIES
- service: the direct name of what this business offers, in plain customer language (not brand/marketing wording).
- problem: a specific, personal, current problem in this business's space, phrased the way someone experiencing it would actually write it.
- outcome: the result/goal a prospect is trying to reach, independent of how they'd get there.
- task: a concrete task or sub-problem someone in this situation gets stuck on.
- tool: a tool, app, or resource a prospect might search for to solve part of this themselves.
- alternative: a competing approach, category, or named option a prospect might be comparing against or trying instead.
- frustration: venting or expressing dissatisfaction about a stalled/failed attempt at solving this — no explicit ask required.
- beginner_language: how a total beginner in this space would describe not knowing where to start.
- advanced_language: how someone experienced in this space, but stuck on an advanced problem, would phrase it.
- decision_language: how someone actively weighing options or deciding whether to get outside help would phrase that internal debate.
- recommendation_language: how someone would phrase asking a community for recommendations or referrals.
- adjacent_concept: a related workflow, topic, or concept that isn't the service itself but that people with this need plausibly also search for or discuss (this is where genuinely non-obvious, semantically-adjacent language belongs).
- other: anything real and useful that doesn't cleanly fit above — never a dumping ground for filler.

RULES
- Ground every single concept in what the offer profile actually says this business sells and solves. Never invent an industry, service, or audience the profile doesn't support.
- Every concept: short — 2-5 words. Long, specific sentences essentially never appear verbatim in real posts; short, ordinary phrases do. This is a hard requirement.
- Concepts must be things a real prospect would actually type — plain, ordinary language. NOT the business's own marketing copy, brand name, slogans, or generic industry jargon a professional (not a customer) would use.
- Do NOT require every concept to contain an obvious buying-intent word ("looking for", "need", "recommend", "hire", etc). Most should NOT. A plain description of a problem, a task, a tool, or a frustration is exactly as valuable as an explicit request — often more so, because it's rarer and less competitive to search.
- If the offer profile states a real geography constraint, include a modest number of location-qualified phrases naturally (e.g. combining a task/problem with the place a local prospect might actually mention it) — spread across whatever categories they naturally fit, not a separate bucket. If the business is remote/anywhere, do not invent a location.
- Never pad with generic filler to hit a target count. Real, specific, well-grounded concepts beat forced ones — it is fine to return fewer than the target if that's honestly all that fits this business.
- Assign "priority" honestly per concept: "high" for concepts you're confident will surface real, actionable prospects; "medium" for plausible but less certain ones; "low" for exploratory/adjacent ones worth testing but unproven.
- Aim for roughly ${targetCount} total concepts across all categories combined, but this is a target, not a quota.

WORKED EXAMPLE (form only — do not reuse this business's content for a different one)
For a bookkeeping cleanup service: service might include "bookkeeping cleanup"; problem might include "books are a mess", "way behind on bookkeeping"; task might include "reconcile bank accounts", "categorize transactions"; tool might include "quickbooks cleanup", "spreadsheet bookkeeping"; frustration might include "hate doing my books"; adjacent_concept might include "tax-ready books", "cash flow tracking". A completely different business (a dentist, a SaaS company, a fitness coach) would produce entirely different phrases across the same 13 categories — generate what's actually real for the business described below, not this example.`;
}

function targetCountFromEnv(): number {
  const raw = process.env.DISCOVERY_TERM_TARGET_COUNT;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(300, Math.round(parsed));
}

export async function generateDiscoveryTerms(offer: Offer, targetCount = targetCountFromEnv()): Promise<DiscoveryTermResult> {
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
      responseSchema: discoveryTermResponseSchema,
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

  const parsed = discoveryTermResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Scout's discovery-planning result failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * Stable fingerprint of the offer fields that actually shape discovery
 * output. Stored on Campaign.discoveryOfferHash after a successful
 * generation; compared against the live offer on every scan (see
 * ensureDiscoveryTerms in searchOrchestrator.ts) so a material change to
 * what the business sells/solves triggers a fresh pool without needing to
 * diff free text every time, and without regenerating on every scan when
 * nothing has actually changed.
 */
export function hashOfferForDiscovery(offer: Offer): string {
  const material = [
    offer.businessType,
    offer.whatYouSell,
    offer.problemsSolved,
    offer.idealCustomer,
    offer.geography ?? "",
    offer.excludedAudiences ?? "",
  ].join(" ");
  return createHash("sha256").update(material).digest("hex");
}

export { DISCOVERY_PROMPT_VERSION };
