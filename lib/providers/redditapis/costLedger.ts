import { prisma } from "@/lib/prisma";
import type { RedditapisRequestType } from "./client";

const PROVIDER = "redditapis";

export type RecordUsageInput = {
  endpoint: string; // e.g. "GET /api/reddit/search"
  requestType: RedditapisRequestType;
  campaignId?: string;
  companyId?: string;
  unitCostUsd: number;
  cacheHit?: boolean;
  success: boolean;
  errorMessage?: string;
};

/** Every provider call, priced or free, cached or live, gets one row here. */
export async function recordUsage(input: RecordUsageInput) {
  await prisma.providerUsageEvent.create({
    data: {
      provider: PROVIDER,
      endpoint: input.endpoint,
      requestType: input.requestType,
      campaignId: input.campaignId,
      companyId: input.companyId,
      unitCostUsd: input.cacheHit ? 0 : input.unitCostUsd,
      cacheHit: input.cacheHit ?? false,
      success: input.success,
      errorMessage: input.errorMessage,
    },
  });
}

/** Lifetime spend actually recorded against Redditapis (cache hits cost $0). */
export async function getLifetimeSpendUsd(): Promise<number> {
  const result = await prisma.providerUsageEvent.aggregate({
    where: { provider: PROVIDER },
    _sum: { unitCostUsd: true },
  });
  return result._sum.unitCostUsd ?? 0;
}

export async function getSpendSince(since: Date): Promise<number> {
  const result = await prisma.providerUsageEvent.aggregate({
    where: { provider: PROVIDER, createdAt: { gte: since } },
    _sum: { unitCostUsd: true },
  });
  return result._sum.unitCostUsd ?? 0;
}

export async function getCallCountSince(since: Date): Promise<number> {
  return prisma.providerUsageEvent.count({
    where: { provider: PROVIDER, createdAt: { gte: since } },
  });
}
