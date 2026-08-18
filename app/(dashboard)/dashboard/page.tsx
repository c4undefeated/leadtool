import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getDashboardStats } from "@/lib/dashboardStats";
import { StatTile } from "@/components/StatTile";
import { ActivityChart } from "@/components/ActivityChart";
import { OpportunityCard } from "@/components/OpportunityCard";

export default async function DashboardPage() {
  const user = await requireUser();
  const companyId = user.companyId ?? "__none__";

  const [stats, recent, campaigns] = await Promise.all([
    getDashboardStats(companyId),
    prisma.opportunity.findMany({
      where: { status: { in: ["new", "reviewed"] }, conversation: { campaign: { companyId } } },
      include: { conversation: true },
      orderBy: [{ matchScore: "desc" }, { analyzedAt: "desc" }],
      take: 4,
    }),
    prisma.campaign.findMany({
      where: { companyId },
      select: { id: true, name: true, status: true, sourceType: true, lastScanAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const activeCampaigns = campaigns.filter((c) => c.status === "active");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-accent mb-1">{user.company?.name}</p>
        <h1 className="font-display text-2xl mb-1">Welcome back{user.name ? `, ${user.name}` : ""}</h1>
        <p className="text-muted text-sm">Here's what Scout found across your campaigns.</p>
      </div>

      <div className="rounded-lg border border-line bg-surface flex flex-wrap sm:flex-nowrap">
        <StatTile label="Opportunities found" trend={stats.found} />
        <StatTile label="Contacted" trend={stats.contacted} />
        <StatTile label="Replied" trend={stats.replied} />
      </div>

      <ActivityChart series={stats.activitySeries} />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted">Newest opportunities</h2>
          <Link href="/opportunities" className="text-xs font-mono text-accent underline">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
            <p className="font-display text-xl mb-2">No strong opportunities found.</p>
            <p className="text-muted text-sm max-w-md mx-auto">
              That's a valid, honest result — Scout doesn't invent leads to fill the feed. Active campaigns
              scan automatically once a day, or import a conversation from a campaign to see something here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {recent.map((o) => (
              <OpportunityCard key={o.id} opportunity={o} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
            Campaigns ({activeCampaigns.length} active of {campaigns.length})
          </h2>
          <Link href="/campaigns" className="text-xs font-mono text-accent underline">
            Manage →
          </Link>
        </div>
        {campaigns.length === 0 ? (
          <p className="text-muted text-sm">No campaigns yet — create one to start finding opportunities.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {campaigns.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="rounded-lg border border-line bg-surface px-4 py-3 flex items-center justify-between hover:border-accent/50"
              >
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs font-mono text-muted mt-0.5">
                    {c.sourceType} ·{" "}
                    {c.lastScanAt ? `last scan ${new Date(c.lastScanAt).toLocaleDateString()}` : "never scanned"}
                  </p>
                </div>
                <span className={`pill ${c.status === "active" ? "pill-good" : "pill-neutral"}`}>{c.status}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
