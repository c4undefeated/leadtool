"use client";

import { useTransition } from "react";
import { updateOpportunityStatusAction } from "@/lib/actions/opportunities";
import { STATUS_LABELS } from "@/lib/format";

const STATUS_ORDER = ["new", "reviewed", "saved", "dismissed", "contacted", "replied", "qualified", "won", "lost"];

export function StatusControl({
  opportunityId,
  currentStatus,
  estimatedValue,
}: {
  opportunityId: string;
  currentStatus: string;
  estimatedValue: number | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        formData.set("opportunityId", opportunityId);
        startTransition(() => updateOpportunityStatusAction(formData));
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="text-xs font-mono text-muted">
        Status
        <select
          name="status"
          defaultValue={currentStatus}
          className="mt-1 block rounded-md border border-line bg-surface px-3 py-2 text-sm"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-mono text-muted">
        Estimated value ($)
        <input
          name="estimatedValue"
          type="number"
          min={0}
          defaultValue={estimatedValue ?? ""}
          className="mt-1 block w-32 rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </label>
      <label className="text-xs font-mono text-muted flex-1 min-w-[160px]">
        Note (optional)
        <input name="note" className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm px-4 py-2 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update"}
      </button>
    </form>
  );
}
