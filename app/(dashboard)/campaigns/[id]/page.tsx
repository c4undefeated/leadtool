import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getAdapter } from "@/lib/sources";
import {
  addKeywordAction,
  removeKeywordAction,
  switchSourceToRedditAction,
  switchSourceToTwitterAction,
  toggleCampaignStatusAction,
  updateExclusionsAction,
} from "@/lib/actions/campaigns";
import { isAiConfigured, isRedditConfigured, isTwitterConfigured } from "@/lib/sourceAvailability";
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
            Last scan: {campaign.lastScanAt ? new Date(campaign.lastScanAt).toLocaleString() : "never yet"}
            {campaign.lastScanCacheHit ? " (served from cache)" : ""}
          </p>
          {campaign.lastScanAt && campaign.lastScanIngested !== null && (
            <p className="text-xs font-mono text-muted mt-1">
              <span className="text-ink">{campaign.lastScanOpportunities}</span> opportunit
              {campaign.lastScanOpportunities === 1 ? "y" : "ies"} · <span className="text-ink">{campaign.lastScanIngested}</span> ingested ·{" "}
              <span
                className="text-ink"
                title="Already-seen posts (same source + ID) — never re-analyzed, zero additional cost."
              >
                {campaign.lastScanSkippedDuplicates}
              </span>{" "}
              duplicate{campaign.lastScanSkippedDuplicates === 1 ? "" : "s"} skipped ·{" "}
              <span
                className="text-ink"
                title="Deleted/removed, too short, or spam/bot boilerplate — dropped before reaching Gemini to protect analysis spend."
              >
                {campaign.lastScanSkippedJunk}
              </span>{" "}
              junk dropped
            </p>
          )}
          {campaign.status === "active" && campaign.sourceType !== "manual" && (
            <p className="text-xs font-mono text-muted mt-1">
              Auto-scanned once daily (in addition to any manual runs) while Active — timing isn't exact, see README.
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
        <h2 className="font-medium text-sm mb-3">Live scanning ({campaign.sourceType})</h2>
        {!aiReady && (
          <p className="text-sm text-caution mb-2">
            GEMINI_API_KEY is not set — Scout can't analyze anything yet, live or manual.
          </p>
        )}
        {campaign.sourceType === "manual" && isRedditConfigured() && (
          <div className="rounded-md border border-line bg-paper p-3 mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              This campaign was created as manual-only. Reddit ingestion (via Redditapis) is now configured —
              switch this campaign to live scanning.
            </p>
            <form action={switchSourceToRedditAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <button type="submit" className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm text-paper hover:bg-accent-hover">
                Switch to live Reddit
              </button>
            </form>
          </div>
        )}
        {campaign.sourceType === "manual" && isTwitterConfigured() && (
          <div className="rounded-md border border-line bg-paper p-3 mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              This campaign was created as manual-only. X/Twitter ingestion (via TwitterAPIs) is now configured —
              switch this campaign to live scanning.
            </p>
            <form action={switchSourceToTwitterAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <button type="submit" className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm text-paper hover:bg-accent-hover">
                Switch to live X/Twitter
              </button>
            </form>
          </div>
        )}
        <p className="text-sm text-muted mb-3">{health.message}</p>
        <div className="flex flex-wrap items-center gap-4 mb-3">
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
          {campaign.sourceType !== "manual" && (
            <LeadRecencySelector campaignId={campaign.id} value={campaign.maxLeadAgeHours} />
          )}
        </div>
        {campaign.sourceType !== "manual" && (
          <p className="text-xs text-muted">
            Posts older than this are never surfaced, even if they'd otherwise match — recency is enforced
            against each post's real timestamp, not just requested from the provider.
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
