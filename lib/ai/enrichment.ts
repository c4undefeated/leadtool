import { getGeminiClient, ANALYSIS_MODEL } from "./client";
import { enrichmentResultSchema, enrichmentResponseSchema, type EnrichmentResult } from "./schemas";
import type { ScrapedSite } from "@/lib/enrichment/scrapeWebsite";

function buildSystemPrompt(): string {
  return `You are Scout's setup assistant inside IntentScout, an AI demand-intelligence platform.

Your job: read the scraped content of ONE business's website and suggest a starting keyword/community/exclusion list a human will review before it's used to monitor Reddit for buying-intent conversations.

RULES
- Ground every suggestion in what the scraped content actually says about this business. Never invent an industry, product, or audience the content doesn't support.
- buyer_keywords: short phrases a real prospect would actually type or say when they have a live need this specific business could serve right now (e.g. "need a [x]", "[x] recommendations", "struggling with [x]") — not the company's own marketing taglines, not generic industry buzzwords.
- target_subreddits: plausible Reddit community names (no "r/" prefix, just the name) where this business's target customers would plausibly discuss this need, based on general knowledge. These are unverified suggestions for a human to check, not confirmed facts.
- excluded_terms: terms likely to cause false positives for this specific business — competitor names actually mentioned on the page, job-seeking/hiring language, industry jargon used by professionals rather than customers, unrelated meanings of ambiguous words on the page.
- If the scraped content is too thin, generic, or unclear to confidently tell what this business actually sells or who it serves, return short or empty arrays rather than guessing or padding with generic filler. Fewer honest suggestions beat more fabricated ones — the same zero-fabrication standard the rest of Scout holds to.
- Every array item: lowercase, concise (a few words), no surrounding quotes or punctuation.`;
}

export async function generateEnrichmentSuggestions(site: ScrapedSite): Promise<EnrichmentResult> {
  const client = getGeminiClient();

  const userContent = [
    `URL: ${site.url}`,
    site.title ? `Title: ${site.title}` : null,
    site.description ? `Meta description: ${site.description}` : null,
    site.headings.length > 0 ? `Headings: ${site.headings.join(" | ")}` : null,
    "",
    "Page text:",
    site.bodyText,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: userContent,
    config: {
      systemInstruction: buildSystemPrompt(),
      responseMimeType: "application/json",
      responseSchema: enrichmentResponseSchema,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Scout's website analysis did not return a result.");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Scout's website analysis result was not valid JSON.");
  }

  const parsed = enrichmentResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Scout's website analysis result failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
