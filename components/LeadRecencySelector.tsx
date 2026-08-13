"use client";

import { useTransition } from "react";
import { updateMaxLeadAgeAction } from "@/lib/actions/campaigns";

const OPTIONS = [
  [12, "12h"],
  [24, "24h (default)"],
  [48, "48h"],
] as const;

export function LeadRecencySelector({ campaignId, value }: { campaignId: string; value: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="text-xs font-mono text-muted flex items-center gap-2">
      <span>Only surface posts from the last</span>
      <select
        defaultValue={value}
        disabled={pending}
        onChange={(e) => {
          const formData = new FormData();
          formData.set("campaignId", campaignId);
          formData.set("maxLeadAgeHours", e.target.value);
          startTransition(() => updateMaxLeadAgeAction(formData));
        }}
        className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs font-mono disabled:opacity-60"
      >
        {OPTIONS.map(([hours, label]) => (
          <option key={hours} value={hours}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
