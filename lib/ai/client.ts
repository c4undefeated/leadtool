import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

/**
 * Thrown when no key is configured. Callers must surface this as "analysis
 * unavailable" — never as a fabricated result. This is the concrete
 * mechanism behind "never silently fabricate."
 */
export class AiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set. AI analysis and drafting are unavailable until it is.");
    this.name = "AiNotConfiguredError";
  }
}

export function getGeminiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new AiNotConfiguredError();
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

// gemini-3.6-flash is, as of this writing, the current stable (non-preview)
// Flash release — verified live against the models.list endpoint rather
// than assumed. Override per-stage via env if that changes.
export const ANALYSIS_MODEL = process.env.INTENTSCOUT_ANALYSIS_MODEL || "gemini-3.6-flash";
export const ENGAGEMENT_MODEL = process.env.INTENTSCOUT_ENGAGEMENT_MODEL || "gemini-3.6-flash";

/**
 * Rough per-analysis-call cost estimate for lib/pipeline.ts's
 * ScanRun.estimatedAiCostUsd — not looked up from a pricing page, measured
 * from real response.usageMetadata on live gemini-3.6-flash calls against
 * the actual production analysis prompt (promptTokenCount ~1600-1800;
 * candidatesTokenCount + thoughtsTokenCount, both billed as output,
 * ~650-1250 depending on post complexity — "thinking" tokens alone roughly
 * doubled a naive candidates-only estimate). At published Flash pricing
 * ($0.75/1M input, $3.75/1M output through 2026), that averaged to
 * ~$0.0047/call across three representative posts (short/casual,
 * medium/indirect-need, long/detailed). An estimate, not a ledger fact —
 * Gemini has no per-call usage-event table in this codebase to read back
 * from the way Redditapis does — so treat this as "roughly what did this
 * scan cost," not something to reconcile against an actual bill.
 */
export const ESTIMATED_GEMINI_COST_PER_ANALYSIS_USD = 0.0047;
