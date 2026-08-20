import { z } from "zod";
import { Type, type Schema } from "@google/genai";

export const ANALYSIS_PROMPT_VERSION = "analysis-v6-gemini";
export const ENGAGEMENT_PROMPT_VERSION = "engagement-v2-gemini";

export const INTENT_CATEGORIES = [
  "tool_request",
  "alternative_search",
  "comparison",
  "hiring_outsourcing",
  "troubleshooting",
  "pain_frustration",
  "exploring_solutions",
  "other",
] as const;

export const analysisResultSchema = z.object({
  is_opportunity: z.boolean(),
  intent_score: z.number().int().min(0).max(100),
  fit_score: z.number().int().min(0).max(100),
  match_score: z.number().int().min(0).max(100),
  confidence: z.enum(["low", "medium", "high"]),
  intent_category: z.enum(INTENT_CATEGORIES),
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
    intent_category: {
      type: Type.STRING,
      enum: [...INTENT_CATEGORIES],
      description:
        "The shape this post's intent takes. tool_request/alternative_search/comparison/hiring_outsourcing/troubleshooting are strong, self-qualifying signals on their own. pain_frustration (venting without explicitly asking for a solution) and exploring_solutions (discussing opinions/experiences, not a personal ask) are weaker — they need real additional signals (specificity, recency, a personal stated need) to justify is_opportunity being true; by themselves they usually shouldn't be. Use \"other\" only when none of these genuinely fit.",
    },
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
    "intent_category",
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

/**
 * Website -> Offer profile, not a keyword list. Earlier versions of this
 * schema produced buyer_keywords/topic_terms designed to be ANDed with a
 * fixed intent-word list at search time — the same narrow-retrieval pattern
 * already removed from the real discovery engine (lib/sources/
 * searchOrchestrator.ts). Scanning a website should feed the same Offer
 * fields a human fills in by hand (lib/actions/{onboarding,settings}.ts),
 * which is what actually drives lib/ai/discovery.ts's broad concept
 * generation — not a second, parallel, narrower vocabulary of its own.
 */
export const siteAnalysisResultSchema = z.object({
  confident: z.boolean(),
  businessType: z.string().max(120),
  whatYouSell: z.string().max(500),
  problemsSolved: z.string().max(500),
  idealCustomer: z.string().max(500),
  geography: z.string().max(300).nullable(),
  excludedAudiences: z.string().max(300).nullable(),
});

export type SiteAnalysisResult = z.infer<typeof siteAnalysisResultSchema>;

/** Website -> Offer profile suggestion for onboarding/settings. Suggestion only — never auto-saved without review. */
export const siteAnalysisResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    confident: {
      type: Type.BOOLEAN,
      description: "False if the page genuinely doesn't give you enough to infer what this business sells and who it serves — in that case the other fields can be short/generic placeholders; a human will fill in the gaps.",
    },
    businessType: { type: Type.STRING, description: "Short label, e.g. \"Online personal training\" — matches the free-text field a human would type in onboarding." },
    whatYouSell: { type: Type.STRING, description: "1-2 plain sentences: what this business actually sells/does." },
    problemsSolved: { type: Type.STRING, description: "1-2 plain sentences: the real, specific problems this business solves for a customer." },
    idealCustomer: { type: Type.STRING, description: "1-2 plain sentences describing who this business actually serves." },
    geography: { type: Type.STRING, nullable: true, description: "A specific city/region the page states this business serves, if any. Null if the business is remote/anywhere or the page doesn't say." },
    excludedAudiences: { type: Type.STRING, nullable: true, description: "Only if the page itself signals a real exclusion (e.g. \"not for beginners\", a stated niche). Null rather than guessed." },
  },
  required: ["confident", "businessType", "whatYouSell", "problemsSolved", "idealCustomer", "geography", "excludedAudiences"],
};

export function priorityTierFromMatchScore(matchScore: number): "high" | "potential" | "low" {
  if (matchScore >= 85) return "high";
  if (matchScore >= 65) return "potential";
  return "low";
}

export const DISCOVERY_PROMPT_VERSION = "discovery-v1-gemini";

/**
 * Individual discovery-concept categories (lib/ai/discovery.ts,
 * lib/sources/searchOrchestrator.ts) — supersedes the old 15-family
 * SEARCH_SURFACE_FAMILIES bundle system. Deliberately separate from
 * intent_category above — a category here describes a RETRIEVAL angle (the
 * kind of language a prospect might use), intent_category describes a
 * CLASSIFICATION of what Gemini found once it got there. Related in spirit,
 * not the same enum on purpose.
 */
export const DISCOVERY_TERM_CATEGORIES = [
  "service",
  "problem",
  "outcome",
  "task",
  "tool",
  "alternative",
  "frustration",
  "beginner_language",
  "advanced_language",
  "decision_language",
  "recommendation_language",
  "adjacent_concept",
  "other",
] as const;

export const DISCOVERY_TERM_PRIORITIES = ["high", "medium", "low"] as const;

export const discoveryTermSchema = z.object({
  term: z.string().min(1).max(80),
  category: z.enum(DISCOVERY_TERM_CATEGORIES),
  priority: z.enum(DISCOVERY_TERM_PRIORITIES),
});

export const discoveryTermResultSchema = z.object({
  terms: z.array(discoveryTermSchema).min(1).max(300),
});

export type DiscoveryTermResult = z.infer<typeof discoveryTermResultSchema>;

/**
 * Business offer -> a large pool of individual discovery concepts.
 * Generated lazily per campaign, then persisted and rotated — see
 * lib/sources/searchOrchestrator.ts.
 *
 * Deliberately no minItems/maxItems on the array itself: live-testing
 * against the real Gemini structured-output endpoint found that any
 * maxItems above 63 on this array causes a hard 400 INVALID_ARGUMENT,
 * regardless of whether it's expressed as a string or number — a real API
 * constraint, not a formatting mistake (confirmed by binary search: 63
 * succeeds, 64 fails). The actual target count is instead carried entirely
 * by the prompt's own "aim for ~N concepts" instruction (see
 * lib/ai/discovery.ts) and enforced client-side as a generous upper bound
 * by discoveryTermResultSchema's zod .max(300) after the response comes
 * back — that check has no such ceiling because it's just an array length
 * comparison, not a schema the model has to satisfy while generating.
 */
export const discoveryTermResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    terms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: {
            type: Type.STRING,
            description: "A short (2-5 word) real-world phrase a prospect might actually write — never a full sentence, never the business's own marketing language.",
          },
          category: { type: Type.STRING, enum: [...DISCOVERY_TERM_CATEGORIES] },
          priority: {
            type: Type.STRING,
            enum: [...DISCOVERY_TERM_PRIORITIES],
            description: "Your own confidence that this concept will surface real prospects for this business — high/medium/low.",
          },
        },
        required: ["term", "category", "priority"],
      },
    },
  },
  required: ["terms"],
};

export const X_PHRASE_PROMPT_VERSION = "x-phrase-v2-gemini";

/**
 * X/Twitter's discovery-vocabulary categories — deliberately its own enum,
 * not DISCOVERY_TERM_CATEGORIES reused, because these are rotation classes
 * for natural CONVERSATIONAL PHRASES (lib/ai/xPhrases.ts), not the shorter
 * topic-concept style DiscoveryTerm uses. Named directly after the rotation
 * classes X/Twitter discovery is meant to cover: direct demand,
 * recommendations, problems, outcomes, solution-seeking, alternatives,
 * comparisons, frustrations, tools/products/services, adjacent concepts,
 * and customer-language variations.
 */
export const X_PHRASE_CATEGORIES = [
  "direct_demand",
  "recommendation",
  "problem",
  "outcome",
  "solution_seeking",
  "alternative",
  "comparison",
  "frustration",
  "tool_product_service",
  "adjacent_concept",
  "customer_language",
  "other",
] as const;

export const xPhraseSchema = z.object({
  phrase: z.string().min(1).max(140),
  category: z.enum(X_PHRASE_CATEGORIES),
  priority: z.enum(DISCOVERY_TERM_PRIORITIES),
});

export const xPhraseResultSchema = z.object({
  phrases: z.array(xPhraseSchema).min(1).max(300),
});

export type XPhraseResult = z.infer<typeof xPhraseResultSchema>;

/**
 * Business offer -> a large pool of natural, conversational search phrases
 * for X/Twitter. Same "no min/maxItems on the array" reasoning as
 * discoveryTermResponseSchema above (a live-verified Gemini structured-
 * output constraint: any maxItems above 63 on an array in a responseSchema
 * causes a hard 400) — the target count lives entirely in the prompt's own
 * "aim for ~N" instruction (lib/ai/xPhrases.ts) and is enforced client-side
 * as a generous upper bound by xPhraseResultSchema's zod .max(300) instead.
 */
export const xPhraseResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    phrases: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          phrase: {
            type: Type.STRING,
            description:
              "Either a SHORT band phrase (roughly 2-4 words — a concise, specific, multi-word X-native concept, never a single bare word) or a LONG band phrase (roughly 5-9 words — a natural conversational fragment, what a real person might actually type in a tweet). Generate a real mix of both bands. Never a single keyword/topic label alone, and never a full formal sentence.",
          },
          category: { type: Type.STRING, enum: [...X_PHRASE_CATEGORIES] },
          priority: {
            type: Type.STRING,
            enum: [...DISCOVERY_TERM_PRIORITIES],
            description: "Your own confidence that this phrase will surface real prospects for this business — high/medium/low.",
          },
        },
        required: ["phrase", "category", "priority"],
      },
    },
  },
  required: ["phrases"],
};

export const COMMUNITY_DISCOVERY_PROMPT_VERSION = "community-discovery-v1-gemini";

/**
 * AI-suggested Reddit retrieval surfaces (spec: "Intelligent Retrieval
 * Assistance") — candidate subreddits generated from a business's Offer,
 * the same lazy per-campaign generation pattern as DiscoveryTerm/
 * XDiscoveryPhrase (see lib/ai/communityDiscovery.ts). `reasoning` is
 * shown directly to the customer (campaign page, opportunity detail page)
 * — must stay a short, plain-English sentence, never raw model/prompt
 * internals. `relatedConcepts` ties a suggestion back to which
 * DISCOVERY_TERM_CATEGORIES it's grounded in, for the "discovery concepts
 * associated with this surface" UI.
 */
export const communityCandidateSchema = z.object({
  name: z.string().min(1).max(30),
  priority: z.enum(DISCOVERY_TERM_PRIORITIES),
  reasoning: z.string().min(1).max(240),
  relatedConcepts: z.array(z.enum(DISCOVERY_TERM_CATEGORIES)).max(6),
});

export const communityCandidateResultSchema = z.object({
  communities: z.array(communityCandidateSchema).min(0).max(60),
});

export type CommunityCandidateResult = z.infer<typeof communityCandidateResultSchema>;

export const communityCandidateResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    communities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "A real, plausible subreddit name with NO \"r/\" prefix (e.g. \"smallbusiness\", not \"r/smallbusiness\") — must follow real Reddit naming conventions (letters/numbers/underscores only). Never invent a name that couldn't plausibly be a real, already-existing subreddit.",
          },
          priority: {
            type: Type.STRING,
            enum: [...DISCOVERY_TERM_PRIORITIES],
            description: "Your own confidence this specific community is where this business's real prospects actually participate — high/medium/low.",
          },
          reasoning: {
            type: Type.STRING,
            description: "One short, plain-English sentence a business owner would understand, e.g. \"Members frequently discuss this exact problem and ask for recommendations.\" Never mention prompts, models, or internal reasoning.",
          },
          relatedConcepts: {
            type: Type.ARRAY,
            items: { type: Type.STRING, enum: [...DISCOVERY_TERM_CATEGORIES] },
            description: "Up to a few discovery-concept categories (from the fixed 13-category list) this suggestion is grounded in — e.g. [\"problem\", \"recommendation_language\"].",
          },
        },
        required: ["name", "priority", "reasoning", "relatedConcepts"],
      },
    },
  },
  required: ["communities"],
};
