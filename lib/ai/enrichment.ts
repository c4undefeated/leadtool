import { getGeminiClient, ANALYSIS_MODEL } from "./client";
import { siteAnalysisResultSchema, siteAnalysisResponseSchema, type SiteAnalysisResult } from "./schemas";
import type { ScrapedSite } from "@/lib/enrichment/scrapeWebsite";

/**
 * Turns a scraped website into an Offer-profile suggestion — the same
 * fields (businessType, whatYouSell, problemsSolved, idealCustomer,
 * geography, excludedAudiences) a human fills in by hand during onboarding
 * or in Settings. This is the "paste your website and Scout figures out
 * your business" entry point; the actual discovery-concept generation that
 * finds prospects happens afterward, from the resulting Offer, via
 * lib/ai/discovery.ts — this module's only job is understanding the
 * business, not deciding what to search for.
 */
function buildSystemPrompt(): string {
  return `You are Scout's setup assistant inside IntentScout, an AI demand-intelligence platform.

Your job: read the scraped content of ONE business's website and infer its offer profile — what they sell, what real problems they solve, and who their ideal customer is. This is the SAME profile a human would type into a short onboarding form; a human reviews and can edit whatever you produce before anything is saved.

Why this matters: this profile is what actually drives Scout's discovery-concept generation downstream — the broad set of real-world problem/outcome/tool/frustration language Scout searches for prospects with. It is NOT itself a list of search phrases or keywords. Do not produce keyword phrases, buying-intent phrases, or anything shaped like a Reddit search query — that is a different system's job, working from what you produce here.

RULES
- Ground every field in what the scraped content actually says. Never invent an industry, service, or audience the content doesn't support.
- businessType/whatYouSell/problemsSolved/idealCustomer: plain, concrete, specific sentences — not marketing taglines copied verbatim from the page, not generic industry boilerplate. Write them the way a founder would describe their own business in a sentence or two to a new hire.
- geography: only fill this in if the page actually states a specific city/region this business serves. Leave it null for anything that reads as remote/nationwide/unclear — a guessed location is worse than no location.
- excludedAudiences: only fill this in if the page itself signals something specific (a stated niche, an explicit "not for X"). Leave it null rather than inventing a plausible-sounding exclusion.
- If the scraped content is too thin, generic, or unclear to confidently tell what this business actually sells or who it serves, set confident to false and keep the other fields short and honest rather than padding or guessing. The same zero-fabrication standard the rest of Scout holds to applies here.`;
}

export async function analyzeSiteForOffer(site: ScrapedSite): Promise<SiteAnalysisResult> {
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
      responseSchema: siteAnalysisResponseSchema,
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

  const parsed = siteAnalysisResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Scout's website analysis result failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
