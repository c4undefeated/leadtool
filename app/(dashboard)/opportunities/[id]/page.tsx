import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parseReasoning, relativeTime, SAFETY_LABELS, ACTION_LABELS, STATUS_LABELS, INTENT_CATEGORY_LABELS, DISCOVERY_CATEGORY_LABELS, LEGACY_SEARCH_FAMILY_LABELS } from "@/lib/format";
import { EngagementPanel } from "@/components/EngagementPanel";
import { StatusControl } from "@/components/StatusControl";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id, conversation: { campaign: { companyId: user.companyId ?? "__none__" } } },
    include: {
      conversation: true,
      activity: { orderBy: { at: "desc" } },
      engagementRecommendations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { commentDraft: true, dmDraft: true },
      },
    },
  });
  if (!opportunity) notFound();

  const reasoning = parseReasoning(opportunity.reasoning);
  const safety = SAFETY_LABELS[opportunity.safetyLabel] ?? SAFETY_LABELS.caution!;
  const latest = opportunity.engagementRecommendations[0] ?? null;

  // Reddit's own DM compose, pre-addressed to this conversation's author —
  // only buildable when we actually have a Reddit username in the expected
  // "u/name" shape. Manual imports from other platforms fall back to
  // opening the original post instead (see EngagementPanel).
  const conversation = opportunity.conversation;
  const redditUsername =
    conversation.source === "reddit" && conversation.authorRef?.startsWith("u/")
      ? conversation.authorRef.slice(2)
      : null;
  const dmComposeUrl = redditUsername
    ? `https://www.reddit.com/message/compose/?to=${encodeURIComponent(redditUsername)}`
    : null;

  // Provenance ("what specifically caused Scout to find this post?"), split
  // into the two distinct discovery sources rather than one vague blended
  // list: the campaign's own manually-entered keywords/topics, and Scout's
  // AI-generated discovery profile (DiscoveryTerm for Reddit, XDiscoveryPhrase
  // for X — see lib/ai/discovery.ts / lib/ai/xPhrases.ts). Real data written
  // at ingestion time (lib/sources/searchOrchestrator.ts's runDiscovery/
  // runXDiscovery), not reconstructed after the fact — this only ever
  // displays what literally matched, never "every keyword this campaign has."
  //
  // conversation.foundByTerms is a JSON string[] mixing three id shapes:
  //   - "precision" (legacy, pre-dates per-keyword attribution): no specific
  //     keyword was recorded, only "the precision layer found this" — shown
  //     as a generic fallback so old opportunities don't lose provenance
  //     entirely, but new scans no longer produce this value.
  //   - "kw:<literal text>": a specific manually-entered keyword/topic that
  //     literally matched this post/tweet's text — the id IS the label, no
  //     DB lookup needed (and none possible: keywords aren't a separate
  //     row-per-match table).
  //   - a real DiscoveryTerm or XDiscoveryPhrase cuid — looked up against
  //     both tables (harmless to query both: cuids are independently
  //     generated per table, so an id only ever matches rows in one of them,
  //     the same safe pattern lib/sources/searchOrchestrator.ts's
  //     creditOpportunityToTerms already uses).
  const yourKeywords: { label: string }[] = [];
  const aiDiscovery: { label: string; category?: string }[] = [];
  if (conversation.foundByTerms) {
    try {
      const ids: string[] = JSON.parse(conversation.foundByTerms);
      if (ids.includes("precision")) yourKeywords.push({ label: DISCOVERY_CATEGORY_LABELS.precision! });
      for (const id of ids) {
        if (id.startsWith("kw:")) yourKeywords.push({ label: id.slice(3) });
      }
      const conceptIds = ids.filter((id) => id !== "precision" && !id.startsWith("kw:"));
      if (conceptIds.length > 0) {
        const [discoveryTerms, xPhrases] = await Promise.all([
          prisma.discoveryTerm.findMany({ where: { id: { in: conceptIds } } }),
          prisma.xDiscoveryPhrase.findMany({ where: { id: { in: conceptIds } } }),
        ]);
        aiDiscovery.push(
          ...discoveryTerms.map((t) => ({ label: t.term, category: DISCOVERY_CATEGORY_LABELS[t.category] ?? t.category })),
          ...xPhrases.map((p) => ({ label: p.phrase, category: DISCOVERY_CATEGORY_LABELS[p.category] ?? p.category })),
        );
      }
    } catch {
      // leave both arrays empty — an honest "no provenance available" over
      // a guess
    }
  } else if (conversation.foundBySurfaces) {
    try {
      const ids: string[] = JSON.parse(conversation.foundBySurfaces);
      const realIds = ids.filter((id) => id !== "baseline");
      const surfaces = realIds.length > 0 ? await prisma.searchSurface.findMany({ where: { id: { in: realIds } } }) : [];
      const families = new Set(ids.map((id) => (id === "baseline" ? "baseline" : (surfaces.find((s) => s.id === id)?.family ?? null))).filter((f): f is string => Boolean(f)));
      aiDiscovery.push(...Array.from(families).map((f) => ({ label: LEGACY_SEARCH_FAMILY_LABELS[f] ?? f })));
    } catch {
      // leave empty
    }
  }

  // Dedup by label (a keyword/concept can independently appear in more than
  // one batch) and cap what's shown — this answers "what caused this,"
  // not "list everything this campaign contains."
  const MAX_SHOWN_PER_GROUP = 5;
  function dedupAndCap<T extends { label: string }>(items: T[]): { shown: T[]; more: number } {
    const seen = new Set<string>();
    const unique = items.filter((i) => (seen.has(i.label) ? false : (seen.add(i.label), true)));
    return { shown: unique.slice(0, MAX_SHOWN_PER_GROUP), more: Math.max(0, unique.length - MAX_SHOWN_PER_GROUP) };
  }
  const yourKeywordsShown = dedupAndCap(yourKeywords);
  const aiDiscoveryShown = dedupAndCap(aiDiscovery);
  const hasProvenance = yourKeywordsShown.shown.length > 0 || aiDiscoveryShown.shown.length > 0;

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* TOP — what this is, at a glance */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="font-mono text-xs text-muted">
            {opportunity.conversation.community ?? opportunity.conversation.source}
            {opportunity.conversation.authorRef ? ` · ${opportunity.conversation.authorRef}` : ""} ·{" "}
            {relativeTime(opportunity.conversation.postedAt)}
          </span>
          <span className={`pill ${safety.className}`}>{safety.text}</span>
        </div>
        {opportunity.conversation.title && (
          <h1 className="font-display text-2xl mb-2">{opportunity.conversation.title}</h1>
        )}
        <a
          href={opportunity.conversation.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-mono text-accent underline"
        >
          Open original →
        </a>
      </div>

      {/* INTELLIGENCE — the five dimensions, kept visibly separate */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <ScoreBlock label="Intent" value={opportunity.intentScore} />
          <ScoreBlock label="Fit" value={opportunity.fitScore} />
          <ScoreBlock label="Match" value={opportunity.matchScore} />
          <ScoreBlock label="Confidence" value={opportunity.confidence} />
        </div>
      </section>

      {/* WHY THIS MATTERS */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <p className="text-xs font-mono uppercase tracking-widest text-muted mb-2">Why this matters</p>
        <p className="text-sm mb-1">
          <span className="font-medium">Detected need: </span>
          {opportunity.detectedNeed}
        </p>
        <p className="text-sm mb-3">
          <span className="font-medium">Why now: </span>
          {opportunity.whyNow}
        </p>
        <ul className="list-disc pl-5 text-sm flex flex-col gap-1 mb-4">
          {reasoning.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <p className="text-xs text-muted border-t border-line pt-3">
          <span className="font-medium text-caution">Safety: </span>
          {opportunity.safetyReason}
        </p>
        {hasProvenance && (
          <div className="text-xs text-muted border-t border-line pt-3 mt-3 flex flex-col gap-2">
            <span className="font-medium text-ink">Discovered through</span>
            {yourKeywordsShown.shown.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted shrink-0">Your keywords:</span>
                {yourKeywordsShown.shown.map((d, i) => (
                  <span key={`kw-${d.label}-${i}`} className="pill pill-neutral">
                    {d.label}
                  </span>
                ))}
                {yourKeywordsShown.more > 0 && <span className="text-muted">+{yourKeywordsShown.more} more</span>}
              </div>
            )}
            {aiDiscoveryShown.shown.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted shrink-0">AI discovery:</span>
                {aiDiscoveryShown.shown.map((d, i) => (
                  <span key={`ai-${d.label}-${i}`} className="pill pill-neutral" title={d.category}>
                    {d.label}
                  </span>
                ))}
                {aiDiscoveryShown.more > 0 && <span className="text-muted">+{aiDiscoveryShown.more} more</span>}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ORIGINAL CONVERSATION */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <p className="text-xs font-mono uppercase tracking-widest text-muted mb-2">Original conversation</p>
        <blockquote className="border-l-2 border-accent pl-4 font-serif italic text-ink/90">
          {opportunity.conversation.originalText}
        </blockquote>
      </section>

      {/* ENGAGEMENT */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-sm mb-3">Engage</h2>
        <EngagementPanel
          opportunityId={opportunity.id}
          originalUrl={opportunity.conversation.url}
          dmComposeUrl={dmComposeUrl}
          safetyLabel={opportunity.safetyLabel}
          contactedAt={opportunity.contactedAt}
          initial={
            latest
              ? {
                  id: latest.id,
                  strategy: latest.strategy,
                  strategyReason: latest.strategyReason,
                  avoidGuidance: latest.avoidGuidance,
                  createdAt: latest.createdAt,
                  commentDraft: latest.commentDraft
                    ? {
                        text: latest.commentDraft.text,
                        whyThisResponse: latest.commentDraft.whyThisResponse,
                        version: latest.commentDraft.version,
                      }
                    : null,
                  dmDraft: latest.dmDraft
                    ? { text: latest.dmDraft.text, whyThisResponse: latest.dmDraft.whyThisResponse, version: latest.dmDraft.version }
                    : null,
                }
              : null
          }
        />
      </section>

      {/* PIPELINE */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-sm mb-3">Pipeline</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="pill pill-neutral">{STATUS_LABELS[opportunity.status]}</span>
          <span className="pill pill-neutral">{ACTION_LABELS[opportunity.recommendedAction]}</span>
          {opportunity.intentCategory && (
            <span className="pill pill-neutral">
              {INTENT_CATEGORY_LABELS[opportunity.intentCategory] ?? opportunity.intentCategory}
            </span>
          )}
          {opportunity.engagementType && (
            <span className="pill pill-accent">Engaged via {opportunity.engagementType}</span>
          )}
        </div>
        <StatusControl
          opportunityId={opportunity.id}
          currentStatus={opportunity.status}
          estimatedValue={opportunity.estimatedValue}
        />
        {opportunity.finalResponse && (
          <div className="mt-4">
            <p className="text-xs font-mono uppercase tracking-widest text-muted mb-1">What was actually sent</p>
            <p className="text-sm rounded-md border border-line bg-paper px-3 py-2 whitespace-pre-wrap">
              {opportunity.finalResponse}
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {opportunity.activity.map((a) => (
            <div key={a.id} className="text-xs font-mono text-muted flex gap-2">
              <span>{new Date(a.at).toLocaleString()}</span>
              <span className="text-ink">{a.event}</span>
              {a.note && <span>— {a.note}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScoreBlock({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-xs font-mono uppercase tracking-widest text-muted">{label}</p>
      <p className="font-display text-2xl text-accent">{value}</p>
    </div>
  );
}
