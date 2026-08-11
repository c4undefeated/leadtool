import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parseReasoning, relativeTime, SAFETY_LABELS, ACTION_LABELS, STATUS_LABELS } from "@/lib/format";
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

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <p className="font-mono text-xs text-muted mb-2">
          {opportunity.conversation.community ?? opportunity.conversation.source} ·{" "}
          {relativeTime(opportunity.conversation.postedAt)} ·{" "}
          <a href={opportunity.conversation.url} target="_blank" rel="noreferrer" className="text-accent underline">
            source
          </a>
        </p>
        {opportunity.conversation.title && (
          <h1 className="font-display text-2xl mb-2">{opportunity.conversation.title}</h1>
        )}
        <blockquote className="border-l-2 border-accent pl-4 font-serif italic text-ink/90">
          {opportunity.conversation.originalText}
        </blockquote>
      </div>

      <section className="rounded-lg border border-line bg-white p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <ScoreBlock label="Intent" value={opportunity.intentScore} />
          <ScoreBlock label="Fit" value={opportunity.fitScore} />
          <ScoreBlock label="Match" value={opportunity.matchScore} />
          <ScoreBlock label="Confidence" value={opportunity.confidence} />
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`pill ${safety.className}`}>{safety.text}</span>
          <span className="pill pill-neutral">{ACTION_LABELS[opportunity.recommendedAction]}</span>
          <span className="pill pill-neutral">{STATUS_LABELS[opportunity.status]}</span>
        </div>
        <p className="text-sm mb-1">
          <span className="font-medium">Detected need: </span>
          {opportunity.detectedNeed}
        </p>
        <p className="text-sm mb-3">
          <span className="font-medium">Why now: </span>
          {opportunity.whyNow}
        </p>
        <p className="text-xs text-muted mb-1">Safety reason: {opportunity.safetyReason}</p>

        <p className="text-xs font-mono uppercase tracking-widest text-muted mt-4 mb-2">Why Scout found this</p>
        <ul className="list-disc pl-5 text-sm flex flex-col gap-1">
          {reasoning.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-white p-5">
        <h2 className="font-medium text-sm mb-3">Engage</h2>
        <EngagementPanel
          opportunityId={opportunity.id}
          originalUrl={opportunity.conversation.url}
          initial={
            latest
              ? {
                  id: latest.id,
                  strategy: latest.strategy,
                  strategyReason: latest.strategyReason,
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

      <section className="rounded-lg border border-line bg-white p-5">
        <h2 className="font-medium text-sm mb-3">Pipeline</h2>
        <StatusControl
          opportunityId={opportunity.id}
          currentStatus={opportunity.status}
          estimatedValue={opportunity.estimatedValue}
        />
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
