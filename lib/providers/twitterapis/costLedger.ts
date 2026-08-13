import { prisma } from "@/lib/prisma";
import type { TwitterApisRequestType } from "./client";

const PROVIDER = "twitterapis";

export type RecordUsageInput = {
  endpoint: string; // e.g. "GET /twitter/tweet/advanced_search"
  requestType: TwitterApisRequestType;
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

/** Lifetime spend actually recorded against TwitterAPIs (cache hits cost $0). */
export async function getLifetimeSpendUsd(): Promise<number> {
  const result = await prisma.providerUsageEvent.aggregate({
    where: { provider: PROVIDER },
    _sum: { unitCostUsd: true },
  });
  return result._sum.unitCostUsd ?? 0;
}
