import type { Offer } from "@prisma/client";
import type { NormalizedConversation } from "@/lib/sources/types";
import { getGeminiClient, ENGAGEMENT_MODEL } from "./client";
import {
  engagementResultSchema,
  engagementResponseSchema,
  ENGAGEMENT_PROMPT_VERSION,
  type EngagementResult,
} from "./schemas";

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

Return your structured result.`;
}

export async function generateEngagementRecommendation(
  conversation: NormalizedConversation,
  offer: Offer,
  detectedNeed: string,
  safetyLabel: string,
  safetyReason: string
): Promise<EngagementResult> {
  const client = getGeminiClient();

  const userContent = [
    conversation.title ? `Title: ${conversation.title}` : null,
    conversation.community ? `Community: ${conversation.community}` : null,
    `URL: ${conversation.url}`,
    "",
    conversation.originalText,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.models.generateContent({
    model: ENGAGEMENT_MODEL,
    contents: userContent,
    config: {
      systemInstruction: buildSystemPrompt(offer, detectedNeed, safetyLabel, safetyReason),
      responseMimeType: "application/json",
      responseSchema: engagementResponseSchema,
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("Scout's engagement call did not return a result.");
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Scout's engagement result was not valid JSON.");
  }

  const parsed = engagementResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Scout's engagement result failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

export { ENGAGEMENT_PROMPT_VERSION };
