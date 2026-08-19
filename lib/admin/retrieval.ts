import { prisma } from "@/lib/prisma";

// Same $0.002/call figure lib/providers/redditapis/client.ts's
// ENDPOINT_UNIT_COST_USD already uses for both "search" and "posts"
// request types — duplicated as a literal here rather than imported to
// avoid pulling a provider-client module into an admin read-query file.
// CommunityCandidate.timesUsed already counts exactly one provider call
// per scan a community was rotated into (see updateCommunityStatsFromScan
// in lib/sources/communityDiscovery.ts), so cost-per-surface is a real
// estimate from real counts, not a guess — same "estimate, not a ledger
// fact" honesty lib/admin/usage.ts already uses for Gemini cost.
const REDDITAPIS_UNIT_COST_USD = 0.002;

export type CampaignCommunityRow = {
  campaignId: string;
  campaignName: string;
  companyName: string;
  manualCommunities: number;
  activeAiCommunities: number;
  suggestedAiCommunities: number;
  opportunityCount: number;
};

export type CommunityPerformanceRow = {
  campaignName: string;
  companyName: string;
  name: string;
  status: string;
  priority: string;
  timesUsed: number;
  candidatesFound: number;
  opportunitiesFound: number;
  estimatedCostUsd: number;
};

export type AdminRetrievalOverview = {
  redditCampaignCount: number;
  zeroCommunityCampaigns: number; // no manual AND no active AI community — relying purely on global search
  campaignsUsingAiCommunities: number; // at least one active CommunityCandidate
  suggestionsAccepted: number; // status = active, originated from AI (i.e. every CommunityCandidate row that reached active)
  suggestionsRejected: number;
  suggestionsPendingReview: number;
  suggestionsInvalid: number;
  zeroOpportunityCampaigns: number; // campaigns with at least one scan but zero opportunities ever
  topCommunities: CommunityPerformanceRow[]; // by opportunitiesFound, across all campaigns
  campaignBreakdown: CampaignCommunityRow[];
};

export async function getAdminRetrievalOverview(): Promise<AdminRetrievalOverview> {
  const [redditCampaigns, candidateStatusCounts, allCandidates] = await Promise.all([
    prisma.campaign.findMany({
      where: { sourceType: "reddit" },
      select: {
        id: true,
        name: true,
        lastScanAt: true,
        company: { select: { name: true } },
        keywords: { where: { type: "subreddit" }, select: { id: true } },
        communityCandidates: { select: { status: true } },
        _count: { select: { conversations: true } },
      },
    }),
    prisma.communityCandidate.groupBy({ by: ["status"], _count: true }),
    prisma.communityCandidate.findMany({
      select: {
        name: true,
        status: true,
        priority: true,
        timesUsed: true,
        candidatesFound: true,
        opportunitiesFound: true,
        campaign: { select: { name: true, company: { select: { name: true } } } },
      },
    }),
  ]);

  const campaignIds = redditCampaigns.map((c) => c.id);
  const opportunityCounts = campaignIds.length
    ? await prisma.opportunity.findMany({
        where: { conversation: { campaignId: { in: campaignIds } } },
        select: { conversation: { select: { campaignId: true } } },
      })
    : [];
  const oppCountByCampaign = new Map<string, number>();
  for (const o of opportunityCounts) {
    const id = o.conversation.campaignId;
    oppCountByCampaign.set(id, (oppCountByCampaign.get(id) ?? 0) + 1);
  }

  const campaignBreakdown: CampaignCommunityRow[] = redditCampaigns.map((c) => ({
    campaignId: c.id,
    campaignName: c.name,
    companyName: c.company.name,
    manualCommunities: c.keywords.length,
    activeAiCommunities: c.communityCandidates.filter((x) => x.status === "active").length,
    suggestedAiCommunities: c.communityCandidates.filter((x) => x.status === "suggested").length,
    opportunityCount: oppCountByCampaign.get(c.id) ?? 0,
  }));

  const zeroCommunityCampaigns = campaignBreakdown.filter((c) => c.manualCommunities === 0 && c.activeAiCommunities === 0).length;
  const campaignsUsingAiCommunities = campaignBreakdown.filter((c) => c.activeAiCommunities > 0).length;
  const zeroOpportunityCampaigns = redditCampaigns.filter((c) => c.lastScanAt !== null && (oppCountByCampaign.get(c.id) ?? 0) === 0).length;

  const statusCount = (status: string) => candidateStatusCounts.find((s) => s.status === status)?._count ?? 0;

  const topCommunities: CommunityPerformanceRow[] = allCandidates
    .filter((c) => c.status !== "invalid")
    .sort((a, b) => b.opportunitiesFound - a.opportunitiesFound || b.candidatesFound - a.candidatesFound)
    .slice(0, 20)
    .map((c) => ({
      campaignName: c.campaign.name,
      companyName: c.campaign.company.name,
      name: c.name,
      status: c.status,
      priority: c.priority,
      timesUsed: c.timesUsed,
      candidatesFound: c.candidatesFound,
      opportunitiesFound: c.opportunitiesFound,
      estimatedCostUsd: c.timesUsed * REDDITAPIS_UNIT_COST_USD,
    }));

  return {
    redditCampaignCount: redditCampaigns.length,
    zeroCommunityCampaigns,
    campaignsUsingAiCommunities,
    suggestionsAccepted: statusCount("active"),
    suggestionsRejected: statusCount("rejected"),
    suggestionsPendingReview: statusCount("suggested"),
    suggestionsInvalid: statusCount("invalid"),
    zeroOpportunityCampaigns,
    topCommunities,
    campaignBreakdown,
  };
}
