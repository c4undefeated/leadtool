import type { Offer } from "@prisma/client";
import type { NormalizedConversation } from "@/lib/sources/types";
import { getAnthropicClient, ENGAGEMENT_MODEL } from "./client";
import {
  engagementResultSchema,
  engagementToolInputSchema,
  ENGAGEMENT_PROMPT_VERSION,
  type EngagementResult,
} from "./schemas";

const TOOL_NAME = "record_engagement";

function buildSystemPrompt(offer: Offer, detectedNeed: string, safetyLabel: string, safetyReason: string): string {
  const style =
    offer.engagementStyle === "direct"
      ? "The user is comfortable being upfront that they offer this — a direct mention is fine if it fits naturally."
      : "Help first. Only mention what the user offers if it fits naturally — don't force a pitch.";

  return `You are Scout, the engagement-guidance engine inside IntentScout. You already know this conversation is a genuine opportunity. Your job now is to recommend HOW to approach it, and draft contextual responses if appropriate.

THE BUSINESS
- What they sell: ${offer.whatYouSell}
- Ideal customer: ${offer.idealCustomer}
- Brand voice: ${offer.brandVoice || "not specified — keep it natural and specific, not generic marketing voice"}
- Engagement style: ${style}

WHAT SCOUT ALREADY DETECTED
- Need: ${detectedNeed}
- Safety: ${safetyLabel} — ${safetyReason}

RULES
- Pick exactly one strategy: "comment" (public reply fits), "dm" (private message fits better), "monitor" (worth watching, not ready to act), or "none" (do not engage — respect the safety assessment above; if safety_label is "not_safe", strategy must be "none" or "monitor", never "comment" or "dm").
- If you draft a comment or DM, it must respond to the ACTUAL text of the conversation — the person's specific words and situation, not a generic template. Never write "Hey! I'm a [role], check out my [thing]!" or anything resembling it.
- Be helpful first. Do not fabricate facts, credentials, or claims not implied by the business profile above.
- Match the brand voice and the requested engagement style.
- Only fill in comment_draft/comment_why when strategy is "comment"; only fill in dm_draft/dm_why when strategy is "dm". Leave the other pair null. Leave both null when strategy is "monitor" or "none".
- "_why" fields should explain, briefly, what in the conversation shaped the draft and why that tone/CTA choice was made — this is shown to the user as "Why this response?".

Call the ${TOOL_NAME} tool with your result.`;
}

export async function generateEngagementRecommendation(
  conversation: NormalizedConversation,
  offer: Offer,
  detectedNeed: string,
  safetyLabel: string,
  safetyReason: string
): Promise<EngagementResult> {
  const client = getAnthropicClient();

  const userContent = [
    conversation.title ? `Title: ${conversation.title}` : null,
    conversation.community ? `Community: ${conversation.community}` : null,
    `URL: ${conversation.url}`,
    "",
    conversation.originalText,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: ENGAGEMENT_MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(offer, detectedNeed, safetyLabel, safetyReason),
    messages: [{ role: "user", content: userContent }],
    tools: [
      {
        name: TOOL_NAME,
        description: "Record the engagement strategy and any drafted response.",
        input_schema: engagementToolInputSchema as unknown as { type: "object"; properties: Record<string, unknown> },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Scout's engagement call did not return a structured result.");
  }

  const parsed = engagementResultSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(`Scout's engagement result failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

export { ENGAGEMENT_PROMPT_VERSION };
