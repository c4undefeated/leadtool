import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { OpportunitiesExplorer } from "@/components/OpportunitiesExplorer";

export default async function OpportunitiesPage() {
  const user = await requireUser();

  const opportunities = await prisma.opportunity.findMany({
    where: { conversation: { campaign: { companyId: user.companyId ?? "__none__" } } },
    select: {
      id: true,
      matchScore: true,
      priorityTier: true,
      safetyLabel: true,
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
  });

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
            That's a valid, honest result — Scout doesn't invent leads to fill the feed. Run a scan or
            import a conversation from a campaign to see something here.
          </p>
        </div>
      ) : (
        <OpportunitiesExplorer opportunities={opportunities} />
      )}
    </div>
  );
}
