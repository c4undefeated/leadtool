import { prisma } from "@/lib/prisma";

const PROVIDER = "twitterapis";
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes — a pure spend guard against accidental duplicate calls

/** Deterministic key for a given request so identical requests within the TTL window share one paid call. */
export function buildCacheKey(requestType: string, params: Record<string, unknown>) {
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
  return `${PROVIDER}:${requestType}?${sorted}`;
}

export async function getCached<T>(cacheKey: string): Promise<T | null> {
  const row = await prisma.providerRequestCache.findUnique({
    where: { cacheKey },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return JSON.parse(row.responseJson) as T;
}

export async function setCached(cacheKey: string, response: unknown, ttlMs = DEFAULT_TTL_MS) {
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.providerRequestCache.upsert({
    where: { cacheKey },
    create: { provider: PROVIDER, cacheKey, responseJson: JSON.stringify(response), expiresAt },
    update: { responseJson: JSON.stringify(response), expiresAt, createdAt: new Date() },
  });
}
