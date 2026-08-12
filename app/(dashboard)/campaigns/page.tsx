import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { NewCampaignForm } from "@/components/NewCampaignForm";

export default async function CampaignsPage() {
  const user = await requireUser();
  const campaigns = await prisma.campaign.findMany({
    where: { companyId: user.companyId ?? "__none__" },
    include: { keywords: true, _count: { select: { conversations: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl mb-1">Campaigns</h1>
        <p className="text-muted text-sm">
          A campaign is a set of keywords/communities Scout watches for one part of your business.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-5 max-w-md">
        <h2 className="font-medium text-sm mb-3">New campaign</h2>
        <NewCampaignForm />
      </div>

      <div className="flex flex-col gap-3">
        {campaigns.map((c) => (
          <Link
            key={c.id}
            href={`/campaigns/${c.id}`}
            className="rounded-lg border border-line bg-surface p-4 flex items-center justify-between hover:border-accent/50"
          >
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted font-mono mt-1">
                {c.keywords.length} keyword{c.keywords.length === 1 ? "" : "s"} · {c._count.conversations} conversation
                {c._count.conversations === 1 ? "" : "s"} seen
                {c.lastScanAt ? ` · last scan ${new Date(c.lastScanAt).toLocaleDateString()}` : ""}
              </p>
            </div>
            <span className={`pill ${c.status === "active" ? "pill-good" : "pill-neutral"}`}>{c.status}</span>
          </Link>
        ))}
        {campaigns.length === 0 && <p className="text-muted text-sm">No campaigns yet.</p>}
      </div>
    </div>
  );
}
