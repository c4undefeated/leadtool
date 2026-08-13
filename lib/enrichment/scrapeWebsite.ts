import * as cheerio from "cheerio";
import { assertPublicHttpUrl } from "./urlSafety";

export type ScrapedSite = {
  url: string;
  title: string | null;
  description: string | null;
  headings: string[];
  bodyText: string;
};

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 3_000_000; // 3MB — plenty for an HTML page, cheap to cap
const MAX_BODY_TEXT_CHARS = 6_000; // keeps the enrichment prompt small and bounded
const MAX_REDIRECTS = 3;
const USER_AGENT = "IntentScoutEnrichmentBot/0.1 (+fetched at a logged-in user's explicit request)";

async function fetchOnce(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
  } catch (err) {
    throw new Error(err instanceof Error && err.name === "AbortError" ? "That site took too long to respond." : "Couldn't reach that site.");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Follows redirects manually, re-running the SSRF guard on every hop's
 * Location header — `fetch`'s built-in redirect following would bypass the
 * initial check entirely if a public URL redirects to a private one.
 */
async function fetchFollowingSafeRedirects(startUrl: URL): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchOnce(current);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("That site redirected without a destination.");
      current = await assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    return res;
  }
  throw new Error("That site redirected too many times.");
}

export async function scrapeWebsite(rawUrl: string): Promise<ScrapedSite> {
  const startUrl = await assertPublicHttpUrl(rawUrl);
  const res = await fetchFollowingSafeRedirects(startUrl);

  if (!res.ok) throw new Error(`That site returned an error (${res.status}).`);

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) throw new Error("That URL isn't an HTML page.");

  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new Error("That page is too large to scan.");

  const html = await res.text();
  if (html.length > MAX_RESPONSE_BYTES) throw new Error("That page is too large to scan.");

  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header, svg, iframe").remove();

  const title = $("title").first().text().trim() || null;
  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;
  const headings = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .slice(0, 8);

  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_BODY_TEXT_CHARS);

  if (!title && !description && headings.length === 0 && bodyText.length < 50) {
    throw new Error("Couldn't find any real content on that page — it may be JavaScript-rendered or mostly empty.");
  }

  return { url: res.url || startUrl.toString(), title, description, headings, bodyText };
}
