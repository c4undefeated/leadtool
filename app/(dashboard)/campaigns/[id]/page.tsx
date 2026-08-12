import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getAdapter } from "@/lib/sources";
import {
  addKeywordAction,
  removeKeywordAction,
  toggleCampaignStatusAction,
  updateExclusionsAction,
} from "@/lib/actions/campaigns";
import { isAiConfigured } from "@/lib/sourceAvailability";
import { getVerticalTemplate } from "@/lib/verticals";
import { RunScanButton } from "@/components/RunScanButton";
import { ImportConversationForm } from "@/components/ImportConversationForm";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({
    where: { id, companyId: user.companyId ?? "__none__" },
    include: {
      keywords: true,
      _count: { select: { conversations: true } },
      company: { include: { offer: true } },
    },
  });
  if (!campaign) notFound();

  const opportunityCount = await prisma.opportunity.count({
    where: { conversation: { campaignId: campaign.id } },
  });

  const adapter = getAdapter(campaign.sourceType);
  const health = await adapter.health();
  const aiReady = isAiConfigured();
  const vertical = campaign.company.offer ? getVerticalTemplate(campaign.company.offer.verticalTemplateKey) : null;

  const keywords = campaign.keywords.filter((k) => k.type === "keyword");
  const communities = campaign.keywords.filter((k) => k.type === "subreddit");

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">{campaign.name}</h1>
          <p className="text-xs font-mono text-muted mt-1">
            {vertical ? `${vertical.label} · ` : ""}source: {campaign.sourceType} · {campaign._count.conversations}{" "}
            conversation{campaign._count.conversations === 1 ? "" : "s"} · {opportunityCount} opportunit
            {opportunityCount === 1 ? "y" : "ies"}
          </p>
          <p className="text-xs font-mono text-muted mt-1">
            Last scan: {campaign.lastScanAt ? new Date(campaign.lastScanAt).toLocaleString() : "never — scans run on demand, not on a schedule"}
          </p>
        </div>
        <form action={toggleCampaignStatusAction}>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <button type="submit" className={`pill ${campaign.status === "active" ? "pill-good" : "pill-neutral"}`}>
            {campaign.status}
          </button>
        </form>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-sm mb-3">Live scanning ({campaign.sourceType})</h2>
        {!aiReady && (
          <p className="text-sm text-caution mb-2">
            GEMINI_API_KEY is not set — Scout can't analyze anything yet, live or manual.
          </p>
        )}
        <p className="text-sm text-muted mb-3">{health.message}</p>
        <RunScanButton
          campaignId={campaign.id}
          disabled={campaign.sourceType === "manual" || health.status !== "ok" || !aiReady}
          disabledReason={
            campaign.sourceType === "manual"
              ? "This campaign's source is manual — use the import form below instead."
              : health.status !== "ok"
                ? health.message
                : undefined
          }
        />
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-sm mb-3">What Scout is looking for</h2>
        <p className="text-xs uppercase tracking-widest text-muted font-mono mb-2">Keywords</p>
        <div className="flex flex-col gap-2 mb-4">
          {keywords.map((k) => (
            <KeywordRow key={k.id} keyword={k} campaignId={campaign.id} />
          ))}
          {keywords.length === 0 && <p className="text-sm text-muted">No keywords yet.</p>}
        </div>
        <form action={addKeywordAction} className="flex gap-2 mb-4">
          <input type="hidden" name="campaignId" value={campaign.id} />
          <input type="hidden" name="type" value="keyword" />
          <input
            name="term"
            placeholder="Add a keyword or phrase"
            className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm">
            Add
          </button>
        </form>

        <p className="text-xs uppercase tracking-widest text-muted font-mono mb-2">Communities</p>
        <div className="flex flex-col gap-2 mb-4">
          {communities.map((k) => (
            <KeywordRow key={k.id} keyword={k} campaignId={campaign.id} />
          ))}
          {communities.length === 0 && <p className="text-sm text-muted">No communities yet — searches all of Reddit.</p>}
        </div>
        <form action={addKeywordAction} className="flex gap-2 mb-4">
          <input type="hidden" name="campaignId" value={campaign.id} />
          <input type="hidden" name="type" value="subreddit" />
          <input
            name="term"
            placeholder="Add a subreddit (no r/ prefix)"
            className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm">
            Add
          </button>
        </form>

        <p className="text-xs uppercase tracking-widest text-muted font-mono mb-2">Exclusions</p>
        <form action={updateExclusionsAction} className="flex gap-2">
          <input type="hidden" name="campaignId" value={campaign.id} />
          <input
            name="exclusions"
            defaultValue={campaign.exclusions ?? ""}
            placeholder="e.g. Other coaches, students, competitors — free text Scout is told to exclude"
            className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm">
            Save
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-sm mb-1">Manual import — validation track</h2>
        <p className="text-sm text-muted mb-4">
          Paste in a real public conversation and Scout will run it through the exact same analysis
          pipeline as live scanning. Use this whenever a source isn't live yet.
        </p>
        <ImportConversationForm campaignId={campaign.id} />
      </section>
    </div>
  );
}

function KeywordRow({ keyword, campaignId }: { keyword: { id: string; term: string }; campaignId: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line px-3 py-1.5 text-sm">
      <span>{keyword.term}</span>
      <form action={removeKeywordAction}>
        <input type="hidden" name="keywordId" value={keyword.id} />
        <input type="hidden" name="campaignId" value={campaignId} />
        <button type="submit" className="text-muted hover:text-risk text-xs font-mono">
          remove
        </button>
      </form>
    </div>
  );
}
