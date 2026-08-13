import { z } from "zod";
import { Type, type Schema } from "@google/genai";

export const ANALYSIS_PROMPT_VERSION = "analysis-v1-gemini";
export const ENGAGEMENT_PROMPT_VERSION = "engagement-v1-gemini";

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

/** Gemini structured-output schema, kept in lockstep with analysisResultSchema above. */
export const analysisResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    is_opportunity: {
      type: Type.BOOLEAN,
      description:
        "False if this conversation is NOT a genuine, actionable buying-intent opportunity for this business — casual chat, hypothetical, spam, already-solved, or too vague. It is normal and expected for this to be false.",
    },
    intent_score: { type: Type.INTEGER, minimum: 0, maximum: 100 },
    fit_score: { type: Type.INTEGER, minimum: 0, maximum: 100 },
    match_score: { type: Type.INTEGER, minimum: 0, maximum: 100 },
    confidence: { type: Type.STRING, enum: ["low", "medium", "high"] },
    detected_need: { type: Type.STRING, description: "Plain-language description of what the person appears to need." },
    why_now: { type: Type.STRING, description: "Why this specific moment matters — recency, urgency, explicit ask." },
    reasoning: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      minItems: "1",
      maxItems: "8",
      description: "Short bullet points explaining the scores, grounded only in the text provided.",
    },
    safety_label: { type: Type.STRING, enum: ["safe", "caution", "not_safe"] },
    safety_reason: { type: Type.STRING, description: "Specific reason for the safety label, citing community context if known." },
    recommended_action: { type: Type.STRING, enum: ["comment", "dm", "monitor", "none"] },
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
};

export const engagementResultSchema = z.object({
  strategy: z.enum(["comment", "dm", "monitor", "none"]),
  strategy_reason: z.string(),
  avoid_guidance: z.string(),
  comment_draft: z.string().nullable(),
  comment_why: z.string().nullable(),
  dm_draft: z.string().nullable(),
  dm_why: z.string().nullable(),
});

export type EngagementResult = z.infer<typeof engagementResultSchema>;

export const engagementResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    strategy: { type: Type.STRING, enum: ["comment", "dm", "monitor", "none"] },
    strategy_reason: { type: Type.STRING },
    avoid_guidance: {
      type: Type.STRING,
      description:
        "What NOT to say or do here — e.g. don't lead with a pitch, don't claim results not stated, don't ignore the community's no-solicitation norms. Always present, even for a comment/dm strategy.",
    },
    comment_draft: { type: Type.STRING, nullable: true, description: "Null unless strategy is comment." },
    comment_why: { type: Type.STRING, nullable: true },
    dm_draft: { type: Type.STRING, nullable: true, description: "Null unless strategy is dm." },
    dm_why: { type: Type.STRING, nullable: true },
  },
  required: ["strategy", "strategy_reason", "avoid_guidance", "comment_draft", "comment_why", "dm_draft", "dm_why"],
};

export const enrichmentResultSchema = z.object({
  buyer_keywords: z.array(z.string()).max(15),
  topic_terms: z.array(z.string()).max(8),
  target_subreddits: z.array(z.string()).max(15),
  excluded_terms: z.array(z.string()).max(15),
});

export type EnrichmentResult = z.infer<typeof enrichmentResultSchema>;

/** Website → keyword/topic/subreddit/exclusion suggestions for campaign setup. Suggestions only — never auto-saved. */
export const enrichmentResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    buyer_keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      maxItems: "15",
      description: "Short phrases a real prospect would type when they have a live need this business could serve — not marketing language.",
    },
    topic_terms: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      maxItems: "8",
      description: "1-3 word core nouns for what this business sells (e.g. \"personal trainer\", \"fitness coach\"), NOT full sentences — these get combined with generic buying-intent words at search time, so they need to be short to be useful.",
    },
    target_subreddits: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      maxItems: "15",
      description: "Plausible subreddit names (no r/ prefix) where this business's target customers would discuss this need. Unverified suggestions.",
    },
    excluded_terms: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      maxItems: "15",
      description: "Terms likely to cause false positives — competitor names, job-seeking language, industry jargon used by professionals rather than customers.",
    },
  },
  required: ["buyer_keywords", "topic_terms", "target_subreddits", "excluded_terms"],
};

export function priorityTierFromMatchScore(matchScore: number): "high" | "potential" | "low" {
  if (matchScore >= 85) return "high";
  if (matchScore >= 65) return "potential";
  return "low";
}
