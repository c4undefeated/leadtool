import Link from "next/link";
import { PLANS, type PlanId } from "@/lib/billing/plans";

/**
 * The one "you've hit a plan limit" UI everywhere in the app renders — never
 * a silently-disabled button or a hidden section. Always names the current
 * plan, what's locked, and the plan that unlocks it, per spec: "The user
 * should never be confused about why something is unavailable."
 */
export function UpgradePrompt({
  message,
  currentPlanName,
  upgradeTo,
}: {
  message: string;
  currentPlanName?: string | null;
  upgradeTo: PlanId | null;
}) {
  return (
    <div className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div>
        {currentPlanName && <p className="text-xs font-mono text-muted mb-0.5">Current plan: {currentPlanName}</p>}
        <p className="text-sm text-ink">{message}</p>
      </div>
      {upgradeTo && (
        <Link
          href="/settings/billing"
          className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition whitespace-nowrap"
        >
          Upgrade to {PLANS[upgradeTo].name} →
        </Link>
      )}
    </div>
  );
}
