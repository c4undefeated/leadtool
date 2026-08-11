import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { OpportunityCard, type CardOpportunity } from "@/components/OpportunityCard";

const ACTIVE_STATUSES = ["new", "reviewed", "saved", "contacted", "replied", "qualified"];

export default async function OpportunitiesPage() {
  const user = await requireUser();

  const opportunities = await prisma.opportunity.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      conversation: { campaign: { companyId: user.companyId ?? "__none__" } },
    },
    include: { conversation: true },
    orderBy: [{ matchScore: "desc" }, { analyzedAt: "desc" }],
  });

  const high = opportunities.filter((o) => o.priorityTier === "high");
  const potential = opportunities.filter((o) => o.priorityTier === "potential");
  const low = opportunities.filter((o) => o.priorityTier === "low");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl mb-1">Today's opportunities</h1>
        <p className="text-muted text-sm font-mono">
          {high.length} high intent · {potential.length} potential · {low.length} low
        </p>
      </div>

      {opportunities.length === 0 && (
        <div className="rounded-lg border border-dashed border-line p-8 text-center">
          <p className="font-display text-xl mb-2">No strong opportunities found.</p>
          <p className="text-muted text-sm max-w-md mx-auto">
            That's a valid, honest result — Scout doesn't invent leads to fill the feed. Run a scan or
            import a conversation from a campaign to see something here.
          </p>
        </div>
      )}

      {high.length > 0 && <Section title="High intent" opportunities={high} />}
      {potential.length > 0 && <Section title="Potential" opportunities={potential} />}
      {low.length > 0 && <Section title="Low" opportunities={low} />}
    </div>
  );
}

function Section({ title, opportunities }: { title: string; opportunities: CardOpportunity[] }) {
  return (
    <section>
      <h2 className="font-mono text-xs uppercase tracking-widest text-muted mb-3">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {opportunities.map((o) => (
          <OpportunityCard key={o.id} opportunity={o} />
        ))}
      </div>
    </section>
  );
}
