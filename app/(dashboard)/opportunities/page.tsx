import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { OpportunitiesExplorer } from "@/components/OpportunitiesExplorer";

export default async function OpportunitiesPage() {
  const user = await requireUser();
  const companyId = user.companyId ?? "__none__";

  const [opportunities, campaignSources] = await Promise.all([
    prisma.opportunity.findMany({
      where: { conversation: { campaign: { companyId } } },
      // Safety cap, not real pagination — this page's filter/sort UI
      // (OpportunitiesExplorer) works client-side over whatever's fetched
      // here, so a genuinely unbounded query would eventually both slow
      // this page down and ship a huge payload to the browser as a
      // company's lifetime opportunity count grows. 500 most-relevant
      // (by the same ordering the page already uses) comfortably covers
      // realistic near-term usage; real server-side pagination is a
      // follow-up if a company's history grows past that.
      take: 500,
      select: {
        id: true,
        matchScore: true,
        priorityTier: true,
        safetyLabel: true,
        intentCategory: true,
        status: true,
        conversation: {
          select: {
            title: true,
            originalText: true,
            community: true,
            authorRef: true,
            postedAt: true,
            source: true,
          },
        },
      },
      orderBy: [{ matchScore: "desc" }, { analyzedAt: "desc" }],
    }),
    // The platform filter should reflect which sources are actually
    // configured for this company (e.g. an active X campaign), not just
    // which ones happen to have already produced a genuine opportunity —
    // otherwise a newly-connected source with zero opportunities so far
    // (an honest, expected state, not a bug) looks like it isn't wired up
    // at all in the filter UI.
    prisma.campaign.findMany({
      where: { companyId },
      select: { sourceType: true },
      distinct: ["sourceType"],
    }),
  ]);
  const configuredSources = campaignSources.map((c) => c.sourceType);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Opportunities</h1>
        <p className="text-muted text-sm">Everything Scout has found, across every campaign.</p>
      </div>

      {opportunities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
          <p className="font-display text-xl mb-2">No strong opportunities found.</p>
          <p className="text-muted text-sm max-w-md mx-auto">
            That's a valid, honest result — Scout doesn't invent leads to fill the feed. Active campaigns
            scan automatically once a day, or import a conversation from a campaign to see something here.
          </p>
        </div>
      ) : (
        <OpportunitiesExplorer opportunities={opportunities} configuredSources={configuredSources} />
      )}
    </div>
  );
}
