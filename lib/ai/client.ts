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
