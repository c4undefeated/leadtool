import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Throws a clear, typed error when no key is configured. Callers must
 * surface this as "analysis unavailable" — never as a fabricated result.
 * This is the concrete mechanism behind "never silently fabricate."
 */
export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. AI analysis and drafting are unavailable until it is.");
    this.name = "AiNotConfiguredError";
  }
}

export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiNotConfiguredError();
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const ANALYSIS_MODEL = process.env.INTENTSCOUT_ANALYSIS_MODEL || "claude-haiku-4-5-20251001";
export const ENGAGEMENT_MODEL = process.env.INTENTSCOUT_ENGAGEMENT_MODEL || "claude-sonnet-5";
