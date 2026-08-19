import { requireAdmin } from "@/lib/auth";
import { getAdminRetrievalOverview } from "@/lib/admin/retrieval";
import { StatCard, StatCardRow, SectionCard, EmptyState, formatUsd } from "@/components/admin/AdminUI";

export default async function AdminRetrievalPage() {
  await requireAdmin();
  const overview = await getAdminRetrievalOverview();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Retrieval Coverage</h1>
        <p className="text-sm text-muted">
          Intelligent Retrieval Assistance — which Reddit campaigns are relying on AI-suggested communities vs.
          global search alone, and which communities are actually producing opportunities across every business.
        </p>
      </div>

      <StatCardRow>
        <StatCard label="Reddit campaigns" value={overview.redditCampaignCount} />
        <StatCard label="Zero configured communities" value={overview.zeroCommunityCampaigns} sub="relying purely on global search" />
        <StatCard label="Using AI-suggested communities" value={overview.campaignsUsingAiCommunities} />
        <StatCard label="Zero-opportunity campaigns" value={overview.zeroOpportunityCampaigns} sub="scanned at least once, 0 opportunities ever" />
      </StatCardRow>

      <StatCardRow>
        <StatCard label="Suggestions active" value={overview.suggestionsAccepted} sub="auto-activated or approved" />
        <StatCard label="Awaiting review" value={overview.suggestionsPendingReview} />
        <StatCard label="Rejected" value={overview.suggestionsRejected} />
        <StatCard label="Failed validation" value={overview.suggestionsInvalid} sub="subreddit didn't exist / wasn't searchable" />
      </StatCardRow>

      <SectionCard title={`Top-performing communities (${overview.topCommunities.length})`}>
        {overview.topCommunities.length === 0 ? (
          <EmptyState>No community activity recorded yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Community</th>
                  <th className="py-2 pr-3 font-medium">Business</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Times used</th>
                  <th className="py-2 pr-3 font-medium">Candidates found</th>
                  <th className="py-2 pr-3 font-medium">Opportunities</th>
                  <th className="py-2 pr-3 font-medium">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {overview.topCommunities.map((c, i) => (
                  <tr key={`${c.campaignName}-${c.name}-${i}`} className="border-b border-line last:border-b-0">
                    <td className="py-2 pr-3">r/{c.name}</td>
                    <td className="py-2 pr-3 text-muted">{c.companyName}</td>
                    <td className="py-2 pr-3 text-muted font-mono text-xs">{c.status}</td>
                    <td className="py-2 pr-3">{c.timesUsed}</td>
                    <td className="py-2 pr-3">{c.candidatesFound}</td>
                    <td className="py-2 pr-3">{c.opportunitiesFound}</td>
                    <td className="py-2 pr-3 text-muted">{formatUsd(c.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Coverage by campaign">
        {overview.campaignBreakdown.length === 0 ? (
          <EmptyState>No Reddit campaigns yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Campaign</th>
                  <th className="py-2 pr-3 font-medium">Business</th>
                  <th className="py-2 pr-3 font-medium">Manual</th>
                  <th className="py-2 pr-3 font-medium">AI-active</th>
                  <th className="py-2 pr-3 font-medium">Suggested</th>
                  <th className="py-2 pr-3 font-medium">Opportunities</th>
                </tr>
              </thead>
              <tbody>
                {overview.campaignBreakdown.map((c) => (
                  <tr key={c.campaignId} className="border-b border-line last:border-b-0">
                    <td className="py-2 pr-3">{c.campaignName}</td>
                    <td className="py-2 pr-3 text-muted">{c.companyName}</td>
                    <td className="py-2 pr-3">{c.manualCommunities}</td>
                    <td className="py-2 pr-3">{c.activeAiCommunities}</td>
                    <td className="py-2 pr-3">{c.suggestedAiCommunities}</td>
                    <td className="py-2 pr-3">{c.opportunityCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
