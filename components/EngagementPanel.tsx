"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { generateEngagementAction } from "@/lib/actions/engagement";
import { markContactedAction, type MarkContactedState } from "@/lib/actions/opportunities";

type Draft = { text: string; whyThisResponse: string; version: number } | null;
type Recommendation = {
  id: string;
  strategy: string;
  strategyReason: string;
  avoidGuidance: string | null;
  createdAt: string | Date;
  commentDraft: Draft;
  dmDraft: Draft;
};

const APPROACH_LABEL: Record<string, string> = {
  comment: "Helpful public comment",
  dm: "Private DM",
  monitor: "Monitor — not ready to act yet",
  none: "Do not engage",
};

export function EngagementPanel({
  opportunityId,
  originalUrl,
  dmComposeUrl,
  safetyLabel,
  contactedAt,
  initial,
}: {
  opportunityId: string;
  originalUrl: string;
  /** Deep link to Reddit's own DM compose, pre-addressed to the conversation's author. Null when the source/author don't support it — the DM draft then just falls back to "Open post". */
  dmComposeUrl: string | null;
  safetyLabel: string;
  contactedAt: string | Date | null;
  initial: Recommendation | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  // No local mirror of `initial` — generateEngagementAction calls revalidatePath server-side,
  // which triggers Next.js to refetch this route's server-rendered data automatically, so the
  // parent server component re-runs and passes the freshly-created recommendation back down.
  const rec = initial;
  const hasGenerated = rec !== null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await generateEngagementAction(opportunityId);
              setError(result?.error);
            })
          }
          className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm px-4 py-2 disabled:opacity-60"
        >
          {pending ? "Thinking…" : hasGenerated ? "Regenerate guidance" : "Get engagement guidance"}
        </button>
        <a
          href={originalUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-line px-4 py-2 text-sm font-mono"
        >
          Open original
        </a>
        {safetyLabel === "not_safe" && (
          <span className="pill pill-risk">Not safe — see safety reason above</span>
        )}
      </div>
      {error && <p className="text-sm text-risk">{error}</p>}

      {rec && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs font-mono uppercase tracking-widest text-muted mb-1">Recommended approach</p>
          <p className="font-display text-lg mb-1">{APPROACH_LABEL[rec.strategy] ?? rec.strategy}</p>
          <p className="text-sm text-muted mb-3">{rec.strategyReason}</p>

          {rec.avoidGuidance && (
            <p className="text-sm rounded-md border border-line bg-paper px-3 py-2 mb-3">
              <span className="font-medium text-caution">Avoid: </span>
              <span className="text-muted">{rec.avoidGuidance}</span>
            </p>
          )}

          {rec.commentDraft && (
            <DraftBox
              label="Generate Comment — draft"
              draft={rec.commentDraft}
              openUrl={originalUrl}
              openLabel="Open post to paste it"
              quickActionLabel="Copy Draft & Open Thread"
            />
          )}
          {rec.dmDraft && (
            <DraftBox
              label="Generate DM — draft"
              draft={rec.dmDraft}
              openUrl={dmComposeUrl ?? originalUrl}
              dmComposeBaseUrl={dmComposeUrl}
              openLabel={dmComposeUrl ? "Open DM to paste it" : "Open post (no DM link available)"}
              quickActionLabel={dmComposeUrl ? "Copy Draft & Open DM" : "Copy Draft & Open Thread"}
            />
          )}
          {!rec.commentDraft && !rec.dmDraft && (
            <p className="text-sm text-muted italic">
              Scout isn't recommending a comment or DM here — see the reason above.
            </p>
          )}
        </div>
      )}

      <MarkContactedForm opportunityId={opportunityId} contactedAt={contactedAt} />
    </div>
  );
}

function DraftBox({
  label,
  draft,
  openUrl,
  dmComposeBaseUrl,
  openLabel,
  quickActionLabel,
}: {
  label: string;
  draft: NonNullable<Draft>;
  openUrl: string;
  /**
   * When set, this draft opens Reddit's own DM compose page — the live edited text gets appended
   * as a `message` query param so Reddit's compose box arrives pre-filled instead of empty. This
   * only pre-fills a text box on Reddit's own site; the human still has to press Send there
   * themselves, same as the plain-copy path. If Reddit ever stops honoring the param, this
   * degrades to exactly the old behavior (an empty compose box the user pastes into).
   */
  dmComposeBaseUrl?: string | null;
  openLabel: string;
  /** Label for the combined one-click copy+open button — kept short and distinct from openLabel's more verbose phrasing. */
  quickActionLabel: string;
}) {
  const [text, setText] = useState(draft.text);
  const [copied, setCopied] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const resolvedOpenUrl = dmComposeBaseUrl ? `${dmComposeBaseUrl}&message=${encodeURIComponent(text)}` : openUrl;

  return (
    <div className="mb-4 last:mb-0">
      <p className="text-xs font-mono uppercase tracking-widest text-muted mb-1">{label}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <button
          type="button"
          onClick={() => {
            // Both calls fire synchronously in this same click handler — window.open
            // has to stay inside the direct user-gesture, otherwise some browsers
            // treat a call made after an awaited clipboard write as a popup and
            // block it. writeText() is fire-and-forget here, same as plain Copy below.
            navigator.clipboard.writeText(text);
            window.open(resolvedOpenUrl, "_blank", "noopener,noreferrer");
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs font-mono rounded-md bg-accent text-paper hover:bg-accent-hover px-3 py-1.5 font-medium"
        >
          {copied ? "Copied — tab open" : quickActionLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs font-mono rounded-md border border-line px-3 py-1.5"
        >
          {copied ? "Copied" : "Copy only"}
        </button>
        <a
          href={resolvedOpenUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-mono rounded-md border border-line px-3 py-1.5"
        >
          {openLabel} →
        </a>
        <button
          type="button"
          onClick={() => setShowWhy((s) => !s)}
          className="text-xs font-mono text-accent underline p-2 -m-2"
        >
          Why this response?
        </button>
      </div>
      {showWhy && <p className="text-sm text-muted mt-2 italic">{draft.whyThisResponse}</p>}
      <p className="text-[11px] text-muted mt-1.5 italic">Copy this, then use "{openLabel}" — paste it there yourself and send. IntentScout never sends it for you.</p>
    </div>
  );
}

function ContactedSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm px-4 py-2 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Mark Contacted"}
    </button>
  );
}

function MarkContactedForm({
  opportunityId,
  contactedAt,
}: {
  opportunityId: string;
  contactedAt: string | Date | null;
}) {
  const [state, formAction] = useActionState<MarkContactedState, FormData>(markContactedAction, undefined);
  const [showFinal, setShowFinal] = useState(false);

  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-xs font-mono uppercase tracking-widest text-muted mb-2">
        After you've sent something yourself
      </p>
      {contactedAt && (
        <p className="text-sm text-good mb-3">
          Marked contacted {new Date(contactedAt).toLocaleString()}. You can update this if you engaged again.
        </p>
      )}
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted flex items-center gap-2">
            <span>How did you engage?</span>
            <select
              name="engagementType"
              defaultValue="comment"
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
            >
              <option value="comment">Public comment</option>
              <option value="dm">Direct message</option>
              <option value="other">Other</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowFinal((s) => !s)}
            className="text-xs font-mono text-accent underline"
          >
            {showFinal ? "Hide" : "Record what I actually sent (optional)"}
          </button>
        </div>
        {showFinal && (
          <textarea
            name="finalResponse"
            rows={3}
            placeholder="Paste the final text you sent, if you edited the draft or wrote your own."
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
        )}
        {state?.error && <p className="text-sm text-risk">{state.error}</p>}
        <div>
          <ContactedSubmitButton />
        </div>
      </form>
      <p className="text-xs text-muted mt-2">
        IntentScout never sends anything on its own — this just records that you did, manually.
      </p>
    </div>
  );
}
