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
import { regenerateDiscoveryTermsAction } from "@/lib/actions/discovery";
import { isAiConfigured } from "@/lib/sourceAvailability";
import { getBetaSettings, getBetaUsageForUser } from "@/lib/beta";
import { scanDisabledReason, sourceLabel, DISCOVERY_CATEGORY_LABELS, relativeTime, SCAN_STATUS_LABELS, describeNextScan } from "@/lib/format";
import { getVerticalTemplate } from "@/lib/verticals";
import { RunScanButton } from "@/components/RunScanButton";
import { ImportConversationForm } from "@/components/ImportConversationForm";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { isPlanId } from "@/lib/billing/plans";

// A live scan can run several Gemini analysis calls (bounded-concurrency,
// see lib/pipeline.ts) — the platform default execution limit is too short
// for a first scan with many new posts. This is a safety margin on top of
// the concurrency fix, not a substitute for it.
export const maxDuration = 60;

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; upgradeTo?: string }>;
}) {
  const { id } = await params;
  const { notice, upgradeTo } = await searchParams;
  const user = await requireUser();
  const campaign = await prisma.campaign.findFirst({
    where: { id, companyId: user.companyId ?? "__none__" },
    include: {
      keywords: true,
      _count: { select: { conversations: true } },
      company: { include: { offer: true } },
      discoveryTerms: { where: { active: true } },
      xDiscoveryPhrases: { where: { active: true } },
      scanRuns: { orderBy: { startedAt: "desc" }, take: 5 },
    },
  });
  if (!campaign) notFound();

  const opportunityCount = await prisma.opportunity.count({
    where: { conversation: { campaignId: campaign.id } },
  });

  const adapter = getAdapter(campaign.sourceType);
  const health = await adapter.health();
  const aiReady = isAiConfigured();
  const betaSettings = await getBetaSettings();
  const betaUsage = betaSettings.enabled ? await getBetaUsageForUser(user.id, betaSettings.manualScansPerUserPerDay) : null;
  const disabledReason = scanDisabledReason({ sourceType: campaign.sourceType, aiReady, healthStatus: health.status });
  const vertical = campaign.company.offer ? getVerticalTemplate(campaign.company.offer.verticalTemplateKey) : null;

  // "keyword" and "topic" used to be treated differently at search time
  // (topics were AND'd with a fixed intent-word list; keywords weren't).
  // That distinction is gone — buildBaselineQuery now OR's both together
  // unconditionally — so they're shown as one merged "precision terms"
  // list. New adds always save as type "keyword"; existing "topic" rows
  // from before this change still display and search exactly the same.
  const precisionTerms = campaign.keywords.filter((k) => k.type === "keyword" || k.type === "topic");
  const communities = campaign.keywords.filter((k) => k.type === "subreddit");

  // Discovery-pool summary — a real, honest view of the rotation pool
  // ("these are seeds, not the whole universe" made concrete), not just
  // copy. Reddit campaigns rotate DiscoveryTerm (short topic concepts); X
  // campaigns rotate their own XDiscoveryPhrase pool (natural conversational
  // phrases, see lib/ai/xPhrases.ts) — normalized to one shape here so the
  // rest of this section doesn't need two parallel branches of JSX.
  const isXCampaign = campaign.sourceType === "twitter";
  const poolNoun = isXCampaign ? "phrases" : "concepts";
  const discoveryPool = isXCampaign
    ? campaign.xDiscoveryPhrases.map((p) => ({ id: p.id, term: p.phrase, category: p.category, timesUsed: p.timesUsed, candidatesFound: p.candidatesFound, opportunitiesFound: p.opportunitiesFound }))
    : campaign.discoveryTerms.map((t) => ({ id: t.id, term: t.term, category: t.category, timesUsed: t.timesUsed, candidatesFound: t.candidatesFound, opportunitiesFound: t.opportunitiesFound }));
  const discoveryCategoryCounts = new Map<string, number>();
  for (const t of discoveryPool) {
    discoveryCategoryCounts.set(t.category, (discoveryCategoryCounts.get(t.category) ?? 0) + 1);
  }
  const topPerformers = [...discoveryPool]
    .filter((t) => t.opportunitiesFound > 0)
    .sort((a, b) => b.opportunitiesFound - a.opportunitiesFound)
    .slice(0, 6);
  const untested = discoveryPool.filter((t) => t.timesUsed === 0);

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {notice && <UpgradePrompt message={notice} upgradeTo={upgradeTo && isPlanId(upgradeTo) ? upgradeTo : null} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl break-words">{campaign.name}</h1>
          <p className="text-xs font-mono text-muted mt-1">
            {vertical ? `${vertical.label} · ` : ""}source: {sourceLabel(campaign.sourceType)} · {campaign._count.conversations}{" "}
            conversation{campaign._count.conversations === 1 ? "" : "s"} · {opportunityCount} opportunit
            {opportunityCount === 1 ? "y" : "ies"}
          </p>
          <p className="text-xs font-mono text-muted mt-1 flex items-center gap-2">
            <span>Last scan: {campaign.lastScanAt ? new Date(campaign.lastScanAt).toLocaleString() : "never yet"}</span>
            {campaign.sourceType !== "manual" && campaign.lastScanStatus && (
              <span className={`pill ${SCAN_STATUS_LABELS[campaign.lastScanStatus]?.className ?? "pill-neutral"}`} title={campaign.lastScanError ?? undefined}>
                {SCAN_STATUS_LABELS[campaign.lastScanStatus]?.text ?? campaign.lastScanStatus}
              </span>
            )}
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
            <p className="text-xs font-mono text-muted mt-1">Next scan: {describeNextScan()}</p>
          )}
          {campaign.status === "paused" && campaign.sourceType !== "manual" && (
            <p className="text-xs font-mono text-muted mt-1">Paused — Scout won't scan this campaign until it's Active again.</p>
          )}
        </div>
        <form action={toggleCampaignStatusAction}>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <button type="submit" className="p-2 -m-2" aria-label={`Campaign is ${campaign.status} — tap to ${campaign.status === "active" ? "pause" : "activate"}`}>
            <span className={`pill ${campaign.status === "active" ? "pill-good" : "pill-neutral"}`}>{campaign.status}</span>
          </button>
        </form>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-sm mb-1">Live scanning</h2>
        {campaign.sourceType === "manual" ? (
          <p className="text-sm text-muted mb-3">
            This campaign uses manual import — add conversations directly below instead of automatic scanning.
          </p>
        ) : (
          <p className="text-sm text-muted mb-3">
            Scout automatically scans this campaign once a day. New qualifying conversations from the last 48
            hours are automatically surfaced here and in your feed — nothing to click, no recency setting to
            manage.
            {disabledReason ? ` ${disabledReason}` : ""}
          </p>
        )}
        {betaSettings.enabled && (
          <>
            <div className="mb-4 rounded-md bg-accent/5 border border-accent/30 px-4 py-3 text-sm">
              <p className="text-ink font-medium">IntentScout is currently in beta testing mode.</p>
              <p className="text-muted mt-1">
                Automatic daily scanning is temporarily disabled. You have a limited number of manual scans available
                each day while we test and improve the discovery engine.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <RunScanButton
                campaignId={campaign.id}
                disabled={campaign.sourceType === "manual" || health.status !== "ok" || !aiReady || (betaUsage?.remaining ?? 0) <= 0}
                disabledReason={betaUsage && betaUsage.remaining <= 0 ? "You've used all your manual scans for today." : disabledReason}
                initialRemaining={betaUsage?.remaining}
                initialLimit={betaUsage?.limit}
              />
            </div>
          </>
        )}
      </section>

      {campaign.sourceType !== "manual" && (
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-4 mb-1">
            <h2 className="font-medium text-sm">Scout's discovery profile</h2>
            <form action={regenerateDiscoveryTermsAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <button type="submit" className="text-xs font-mono text-muted hover:text-ink underline p-2 -m-2">
                Regenerate
              </button>
            </form>
          </div>
          {discoveryPool.length > 0 ? (
            <>
              <p className="text-sm text-muted mb-4">
                Scout read your offer profile (Settings → Offer) and generated{" "}
                <span className="text-ink">{discoveryPool.length}</span> discovery {poolNoun} —{" "}
                {isXCampaign
                  ? "natural, conversational phrases a real prospect might actually tweet, not necessarily your own words"
                  : "the language a real prospect might actually use, not necessarily your own words"}{" "}
                — and rotates a batch of them into every scan. This is the primary way Scout finds people, not
                the precision terms below. {poolNoun === "phrases" ? "Phrases" : "Concepts"} that keep finding
                real opportunities get prioritized; ones that don't fade without ever being fully dropped.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {Array.from(discoveryCategoryCounts.entries()).map(([category, count]) => (
                  <span key={category} className="pill pill-neutral">
                    {DISCOVERY_CATEGORY_LABELS[category] ?? category}: {count}
                  </span>
                ))}
              </div>

              {topPerformers.length > 0 && (
                <>
                  <p className="text-xs uppercase tracking-widest text-muted font-mono mb-2">Top performers</p>
                  <div className="flex flex-col gap-1 mb-4">
                    {topPerformers.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{t.term}</span>
                        <span className="text-xs font-mono text-muted shrink-0 whitespace-nowrap">
                          {t.opportunitiesFound} opportunit{t.opportunitiesFound === 1 ? "y" : "ies"} / {t.candidatesFound} found
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {untested.length > 0 && (
                <>
                  <p className="text-xs uppercase tracking-widest text-muted font-mono mb-2">Not tested yet</p>
                  <p className="text-xs text-muted mb-1">
                    {untested
                      .slice(0, 8)
                      .map((t) => t.term)
                      .join(" · ")}
                    {untested.length > 8 ? ` · +${untested.length - 8} more` : ""}
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">
              No discovery {poolNoun} generated yet — finish your offer profile in Settings → Offer and Scout
              will build one automatically before its next daily scan.
            </p>
          )}

          {campaign.scanRuns.length > 0 && (
            <>
              <p className="text-xs uppercase tracking-widest text-muted font-mono mb-2 mt-4">Recent scans</p>
              <div className="flex flex-col gap-1">
                {campaign.scanRuns.map((run) => {
                  const rejectedByGemini = Math.max(0, run.aiAnalyzedCount - run.opportunitiesCreated - run.aiErrors);
                  const totalCost = run.providerSpendUsd + run.estimatedAiCostUsd;
                  return (
                    <p key={run.id} className="text-xs font-mono text-muted">
                      {relativeTime(run.startedAt)}: {run.discoveryTermsUsed} {poolNoun} → {run.rawProviderResults} raw →{" "}
                      {run.uniqueConversations} unique → {run.aiAnalyzedCount} sent to Gemini
                      {run.candidatesCarriedOver > 0 ? ` (${run.candidatesCarriedOver} backlog)` : ""} →{" "}
                      {rejectedByGemini} rejected →{" "}
                      <span className="text-ink">{run.opportunitiesCreated}</span> opportunit
                      {run.opportunitiesCreated === 1 ? "y" : "ies"}
                      {" · "}
                      <span title={`${sourceLabel(campaign.sourceType)} provider spend + estimated Gemini cost — the AI figure is a measured estimate, not a ledger fact.`}>
                        ~${totalCost.toFixed(3)}
                      </span>
                      {run.searchesSkippedBudget > 0
                        ? ` — ${run.searchesSkippedBudget} of ${run.searchesPlanned} planned searches skipped (budget)`
                        : ""}
                      {run.providerErrors > 0 || run.aiErrors > 0
                        ? ` (${run.providerErrors + run.aiErrors} error${run.providerErrors + run.aiErrors === 1 ? "" : "s"})`
                        : ""}
                    </p>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-sm mb-1">Precision terms (optional)</h2>
        <p className="text-sm text-muted mb-3">
          Exact phrases you already know are worth searching, always included alongside Scout's own discovery
          concepts above. Not required — Scout's discovery profile is what does most of the work.
        </p>
        <div className="flex flex-col gap-2 mb-4">
          {precisionTerms.map((k) => (
            <KeywordRow key={k.id} keyword={k} campaignId={campaign.id} />
          ))}
          {precisionTerms.length === 0 && <p className="text-sm text-muted">None yet.</p>}
        </div>
        <form action={addKeywordAction} className="flex gap-2 mb-4">
          <input type="hidden" name="campaignId" value={campaign.id} />
          <input type="hidden" name="type" value="keyword" />
          <input
            name="term"
            placeholder="Add a phrase, e.g. personal trainer pinehurst nc"
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
        <button type="submit" className="text-muted hover:text-risk text-xs font-mono p-2 -m-2">
          remove
        </button>
      </form>
    </div>
  );
}
