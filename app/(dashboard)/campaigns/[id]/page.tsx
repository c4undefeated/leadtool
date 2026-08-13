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
import { scanDisabledReason, sourceLabel } from "@/lib/format";
import { getVerticalTemplate } from "@/lib/verticals";
import { RunScanButton } from "@/components/RunScanButton";
import { ImportConversationForm } from "@/components/ImportConversationForm";
import { WebsiteEnrichmentPanel } from "@/components/WebsiteEnrichmentPanel";
import { LeadRecencySelector } from "@/components/LeadRecencySelector";

// A live scan can run several Gemini analysis calls (bounded-concurrency,
// see lib/pipeline.ts) — the platform default execution limit is too short
// for a first scan with many new posts. This is a safety margin on top of
// the concurrency fix, not a substitute for it.
export const maxDuration = 60;

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
  const disabledReason = scanDisabledReason({ sourceType: campaign.sourceType, aiReady, healthStatus: health.status });
  const vertical = campaign.company.offer ? getVerticalTemplate(campaign.company.offer.verticalTemplateKey) : null;

  const keywords = campaign.keywords.filter((k) => k.type === "keyword");
  const communities = campaign.keywords.filter((k) => k.type === "subreddit");

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">{campaign.name}</h1>
          <p className="text-xs font-mono text-muted mt-1">
            {vertical ? `${vertical.label} · ` : ""}source: {sourceLabel(campaign.sourceType)} · {campaign._count.conversations}{" "}
            conversation{campaign._count.conversations === 1 ? "" : "s"} · {opportunityCount} opportunit
            {opportunityCount === 1 ? "y" : "ies"}
          </p>
          <p className="text-xs font-mono text-muted mt-1">
            Last scan: {campaign.lastScanAt ? new Date(campaign.lastScanAt).toLocaleString() : "never yet"}
          </p>
          {campaign.lastScanAt && campaign.lastScanIngested !== null && (
            <p className="text-xs font-mono text-muted mt-1">
              <span className="text-ink">{campaign.lastScanOpportunities}</span> opportunit
              {campaign.lastScanOpportunities === 1 ? "y" : "ies"} · <span className="text-ink">{campaign.lastScanIngested}</span> ingested ·{" "}
              <span className="text-ink" title="Already seen before — Scout never re-analyzes the same post twice.">
                {campaign.lastScanSkippedDuplicates}
              </span>{" "}
              duplicate{campaign.lastScanSkippedDuplicates === 1 ? "" : "s"} skipped ·{" "}
              <span
                className="text-ink"
                title="Removed, too short, or spam — filtered out before analysis so your results stay clean."
              >
                {campaign.lastScanSkippedJunk}
              </span>{" "}
              junk dropped
            </p>
          )}
          {campaign.status === "active" && campaign.sourceType !== "manual" && (
            <p className="text-xs font-mono text-muted mt-1">
              Scout automatically re-checks this campaign daily while it's Active.
            </p>
          )}
        </div>
        <form action={toggleCampaignStatusAction}>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <button type="submit" className={`pill ${campaign.status === "active" ? "pill-good" : "pill-neutral"}`}>
            {campaign.status}
          </button>
        </form>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-sm mb-3">Live scanning</h2>
        <div className="flex flex-wrap items-center gap-4 mb-3">
          <RunScanButton
            campaignId={campaign.id}
            disabled={campaign.sourceType === "manual" || health.status !== "ok" || !aiReady}
            disabledReason={disabledReason}
          />
          {campaign.sourceType !== "manual" && (
            <LeadRecencySelector campaignId={campaign.id} value={campaign.maxLeadAgeHours} />
          )}
        </div>
        {campaign.sourceType !== "manual" && (
          <p className="text-xs text-muted">
            Posts older than this are never surfaced, even if they'd otherwise match — recency is enforced
            against each post's real timestamp.
          </p>
        )}
      </section>

      <WebsiteEnrichmentPanel campaignId={campaign.id} />

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

        {campaign.sourceType !== "twitter" && (
          <>
            <p className="text-xs uppercase tracking-widest text-muted font-mono mb-2">Communities</p>
            <div className="flex flex-col gap-2 mb-4">
              {communities.map((k) => (
                <KeywordRow key={k.id} keyword={k} campaignId={campaign.id} />
              ))}
              {communities.length === 0 && (
                <p className="text-sm text-muted">No communities yet — searches all of Reddit.</p>
              )}
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
          </>
        )}

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
