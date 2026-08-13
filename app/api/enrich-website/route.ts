import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { scrapeWebsite } from "@/lib/enrichment/scrapeWebsite";
import { generateEnrichmentSuggestions } from "@/lib/ai/enrichment";
import { AiNotConfiguredError } from "@/lib/ai/client";

// Scrape (network I/O, up to a few redirects) + one Gemini call — bounded,
// but generous relative to the platform default in case a target site is slow.
export const maxDuration = 30;

export async function POST(request: Request) {
  // Authenticated feature only — this endpoint drives an outbound fetch to
  // a URL the caller supplies and spends a Gemini call, neither of which
  // should be reachable by anonymous traffic.
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const url = typeof (body as { url?: unknown })?.url === "string" ? (body as { url: string }).url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "Provide a URL." }, { status: 400 });
  }

  let site;
  try {
    site = await scrapeWebsite(url);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't scan that site." }, { status: 502 });
  }

  try {
    const suggestions = await generateEnrichmentSuggestions(site);
    return NextResponse.json({
      siteTitle: site.title,
      siteDescription: site.description,
      buyerKeywords: suggestions.buyer_keywords,
      targetSubreddits: suggestions.target_subreddits,
      excludedTerms: suggestions.excluded_terms,
    });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't analyze that site." }, { status: 500 });
  }
}
