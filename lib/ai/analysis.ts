import type { Offer } from "@prisma/client";
import type { NormalizedConversation } from "@/lib/sources/types";
import { getAnthropicClient, ANALYSIS_MODEL } from "./client";
import { analysisResultSchema, analysisToolInputSchema, ANALYSIS_PROMPT_VERSION, type AnalysisResult } from "./schemas";

const TOOL_NAME = "record_analysis";

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

SCORING RULES
- intent_score: does this person show CURRENT, real buying intent — explicit request for help/a provider, stated problem, urgency, recency, specificity, willingness to spend, a prior failed solution? Casual chat, hypotheticals, purely educational discussion, or an already-solved problem push this DOWN.
- fit_score: how well does this match the business's offer, ideal customer, price range, geography, and exclusions above?
- match_score: your overall judgment combining intent and fit — but you must still report intent_score and fit_score honestly and separately. Never let one silently stand in for the other.
- confidence: how sure are you that your read of this conversation is correct, independent of how good the match is?
- safety_label: "safe" if this looks like a context where a helpful, non-spammy reply would be normal and welcome (e.g. someone explicitly asked for recommendations); "caution" if replying is possible but should avoid direct promotion; "not_safe" if the community/context clearly disallows solicitation or the framing is inappropriate for outside commercial reply. Ground this in what's actually visible in the text, not assumptions.
- recommended_action: "comment" (public reply fits), "dm" (a private message fits better), "monitor" (interesting but not ready to act on yet), or "none".

CRITICAL — ZERO-RESULT INTEGRITY
Set is_opportunity to FALSE whenever the conversation is not a genuine, actionable match. This is the expected, common outcome — most conversations are not opportunities. Do NOT lower your standards, pad the results, or talk yourself into a weak match to seem useful. Never invent facts, quotes, or intent that aren't actually present in the text. Base every score and every reasoning bullet only on what's in the conversation and the business profile above.

Call the ${TOOL_NAME} tool with your structured result. Always call it, even when is_opportunity is false — in that case the other fields can reflect your best honest read, they simply won't be stored.`;
}

export async function analyzeConversation(
  conversation: NormalizedConversation,
  offer: Offer
): Promise<AnalysisResult | null> {
  const client = getAnthropicClient();

  const userContent = [
    conversation.title ? `Title: ${conversation.title}` : null,
    conversation.community ? `Community: ${conversation.community}` : null,
    `Posted: ${conversation.postedAt.toISOString()}`,
    "",
    conversation.originalText,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(offer),
    messages: [{ role: "user", content: userContent }],
    tools: [
      {
        name: TOOL_NAME,
        description: "Record the structured analysis result for this conversation.",
        // The Anthropic SDK expects a plain JSON Schema object here; our hand-authored
        // schema is typed as a readonly literal for editor safety, so it's widened at the call site.
        input_schema: analysisToolInputSchema as unknown as { type: "object"; properties: Record<string, unknown> },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Scout's analysis call did not return a structured result.");
  }

  const parsed = analysisResultSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(`Scout's analysis result failed validation: ${parsed.error.message}`);
  }

  if (!parsed.data.is_opportunity) {
    return null;
  }

  return parsed.data;
}

export { ANALYSIS_PROMPT_VERSION };
