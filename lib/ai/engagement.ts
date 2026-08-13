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
- strategy is your recommended PRIMARY approach: "comment" (public reply fits best), "dm" (private message fits best), "monitor" (worth watching, not ready to act), or "none" (do not engage — respect the safety assessment above; if safety_label is "not_safe", strategy must be "none" or "monitor", never "comment" or "dm").
- Whenever safety_label is "safe" or "caution" (engaging is advisable at all), draft BOTH comment_draft and dm_draft, not just the one matching strategy — the human decides which channel to actually use, not you; give them both real options instead of gatekeeping down to one. Leave both null only when strategy is "monitor" or "none" (safety doesn't support drafting anything yet).
- If you draft a comment or DM, it must respond to the ACTUAL text of the conversation — the person's specific words and situation, not a generic template. Never write "Hey! I'm a [role], check out my [thing]!" or anything resembling it. The comment and DM should differ in register (comment: public, brief, community-appropriate; DM: private, more direct) — not just be the same text copy-pasted into both fields.
- Be helpful first. Do not fabricate facts, credentials, or claims not implied by the business profile above.
- Match the brand voice and the requested engagement style.
- "_why" fields should explain, briefly, what in the conversation shaped the draft and why that tone/CTA choice was made — this is shown to the user as "Why this response?".
- strategy_reason should explain why that channel is the primary recommendation, while acknowledging the other draft is also available if the human prefers it.
- avoid_guidance is always required, regardless of strategy: one or two concrete sentences on what NOT to do here specifically (e.g. don't lead with price, don't claim a specific result, don't ignore that this subreddit dislikes self-promotion) — grounded in the actual conversation and safety context, not generic advice.

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
