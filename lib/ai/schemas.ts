import { z } from "zod";

export const ANALYSIS_PROMPT_VERSION = "analysis-v1";
export const ENGAGEMENT_PROMPT_VERSION = "engagement-v1";

export const analysisResultSchema = z.object({
  is_opportunity: z.boolean(),
  intent_score: z.number().int().min(0).max(100),
  fit_score: z.number().int().min(0).max(100),
  match_score: z.number().int().min(0).max(100),
  confidence: z.enum(["low", "medium", "high"]),
  detected_need: z.string(),
  why_now: z.string(),
  reasoning: z.array(z.string()).min(1).max(8),
  safety_label: z.enum(["safe", "caution", "not_safe"]),
  safety_reason: z.string(),
  recommended_action: z.enum(["comment", "dm", "monitor", "none"]),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

/** Hand-authored JSON Schema for Claude's tool_use — kept in lockstep with analysisResultSchema above. */
export const analysisToolInputSchema = {
  type: "object",
  properties: {
    is_opportunity: {
      type: "boolean",
      description:
        "False if this conversation is NOT a genuine, actionable buying-intent opportunity for this business — casual chat, hypothetical, spam, already-solved, or too vague. It is normal and expected for this to be false.",
    },
    intent_score: { type: "integer", minimum: 0, maximum: 100 },
    fit_score: { type: "integer", minimum: 0, maximum: 100 },
    match_score: { type: "integer", minimum: 0, maximum: 100 },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    detected_need: { type: "string", description: "Plain-language description of what the person appears to need." },
    why_now: { type: "string", description: "Why this specific moment matters — recency, urgency, explicit ask." },
    reasoning: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 8,
      description: "Short bullet points explaining the scores, grounded only in the text provided.",
    },
    safety_label: { type: "string", enum: ["safe", "caution", "not_safe"] },
    safety_reason: { type: "string", description: "Specific reason for the safety label, citing community context if known." },
    recommended_action: { type: "string", enum: ["comment", "dm", "monitor", "none"] },
  },
  required: [
    "is_opportunity",
    "intent_score",
    "fit_score",
    "match_score",
    "confidence",
    "detected_need",
    "why_now",
    "reasoning",
    "safety_label",
    "safety_reason",
    "recommended_action",
  ],
} as const;

export const engagementResultSchema = z.object({
  strategy: z.enum(["comment", "dm", "monitor", "none"]),
  strategy_reason: z.string(),
  comment_draft: z.string().nullable(),
  comment_why: z.string().nullable(),
  dm_draft: z.string().nullable(),
  dm_why: z.string().nullable(),
});

export type EngagementResult = z.infer<typeof engagementResultSchema>;

export const engagementToolInputSchema = {
  type: "object",
  properties: {
    strategy: { type: "string", enum: ["comment", "dm", "monitor", "none"] },
    strategy_reason: { type: "string" },
    comment_draft: { type: ["string", "null"], description: "Null unless strategy is comment." },
    comment_why: { type: ["string", "null"] },
    dm_draft: { type: ["string", "null"], description: "Null unless strategy is dm." },
    dm_why: { type: ["string", "null"] },
  },
  required: ["strategy", "strategy_reason", "comment_draft", "comment_why", "dm_draft", "dm_why"],
} as const;

export function priorityTierFromMatchScore(matchScore: number): "high" | "potential" | "low" {
  if (matchScore >= 85) return "high";
  if (matchScore >= 65) return "potential";
  return "low";
}
