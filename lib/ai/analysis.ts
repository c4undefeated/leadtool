import type { Offer } from "@prisma/client";
import type { NormalizedConversation } from "@/lib/sources/types";
import { getGeminiClient, ANALYSIS_MODEL } from "./client";
import { analysisResultSchema, analysisResponseSchema, ANALYSIS_PROMPT_VERSION, type AnalysisResult } from "./schemas";

function buildSystemPrompt(offer: Offer): string {
  return `You are Scout, the analysis engine inside IntentScout, an AI demand-intelligence platform.

Your only job on this call: read ONE public conversation and decide whether the person in it shows genuine, current buying intent that this specific business could serve. You are not a keyword matcher — most conversations that merely mention a relevant topic are NOT opportunities.

THE BUSINESS
- What they sell: ${offer.whatYouSell}
- Problems they solve: ${offer.problemsSolved || "(not specified)"}
- Ideal customer: ${offer.idealCustomer}
- Price range: ${offer.priceRangeMin ?? "?"} - ${offer.priceRangeMax ?? "?"}
- Geography constraint: ${offer.geography || "none — remote/anywhere is fine"}
- Explicitly excluded audiences: ${offer.excludedAudiences || "none stated"}
- Brand voice: ${offer.brandVoice || "not specified"}

The current date and time is ${new Date().toISOString()}. Use this to judge recency — you are not told "now" any other way.

SCORING RULES
- intent_score: does this person show CURRENT, real buying intent — explicit request for help/a provider, stated problem, urgency, recency, specificity, willingness to spend, a prior failed solution? Casual chat, hypotheticals, purely educational discussion, or an already-solved problem push this DOWN. Treat staleness as a hard discount, not a minor factor: a conversation more than a few weeks old should score low on intent even if the original text reads as urgent, because the person was very likely already helped, moved on, or lost interest — someone reading a months-old post has no real reason to believe the need is still open. Weeks-old = noticeably lower; months-old = treat as very low intent regardless of how the text reads, and is_opportunity should usually be false unless something in the text itself indicates the need is ongoing (e.g. "still looking after months").
- fit_score: how well does this match the business's offer, ideal customer, price range, geography, and exclusions above?
- match_score: your overall judgment combining intent and fit — but you must still report intent_score and fit_score honestly and separately. Never let one silently stand in for the other.
- confidence: how sure are you that your read of this conversation is correct, independent of how good the match is?
- safety_label: "safe" if this looks like a context where a helpful, non-spammy reply would be normal and welcome (e.g. someone explicitly asked for recommendations); "caution" if replying is possible but should avoid direct promotion; "not_safe" if the community/context clearly disallows solicitation or the framing is inappropriate for outside commercial reply. Ground this in what's actually visible in the text, not assumptions.
- recommended_action: "comment" (public reply fits), "dm" (a private message fits better), "monitor" (interesting but not ready to act on yet), or "none".

CRITICAL — ZERO-RESULT INTEGRITY
Set is_opportunity to FALSE whenever the conversation is not a genuine, actionable match. This is the expected, common outcome — most conversations are not opportunities. Do NOT lower your standards, pad the results, or talk yourself into a weak match to seem useful. Never invent facts, quotes, or intent that aren't actually present in the text. Base every score and every reasoning bullet only on what's in the conversation and the business profile above.

Return your result even when is_opportunity is false — in that case the other fields can reflect your best honest read, they simply won't be stored.`;
}

export async function analyzeConversation(
  conversation: NormalizedConversation,
  offer: Offer
): Promise<AnalysisResult | null> {
  const client = getGeminiClient();

  const userContent = [
    conversation.title ? `Title: ${conversation.title}` : null,
    conversation.community ? `Community: ${conversation.community}` : null,
    `Posted: ${conversation.postedAt.toISOString()}`,
    "",
    conversation.originalText,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: userContent,
    config: {
      systemInstruction: buildSystemPrompt(offer),
      responseMimeType: "application/json",
      responseSchema: analysisResponseSchema,
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("Scout's analysis call did not return a result.");
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Scout's analysis result was not valid JSON.");
  }

  const parsed = analysisResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Scout's analysis result failed validation: ${parsed.error.message}`);
  }

  if (!parsed.data.is_opportunity) {
    return null;
  }

  return parsed.data;
}

export { ANALYSIS_PROMPT_VERSION };
