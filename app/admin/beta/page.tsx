import { requireAdmin } from "@/lib/auth";
import { getAdminBetaOverview } from "@/lib/admin/beta";
import { setBetaModeAction, setScanningPausedAction, setManualScanLimitAction, resetTodaysBetaCountersAction } from "@/lib/actions/beta";
import { StatCard, StatCardRow, SectionCard, EmptyState, formatUsd, relativeOrNever } from "@/components/admin/AdminUI";

const SCAN_LIMIT_OPTIONS = [1, 2, 3, 5, 10];

export default async function AdminBetaPage() {
  await requireAdmin();
  const overview = await getAdminBetaOverview();
  const { settings } = overview;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Beta Mode</h1>
        <p className="text-sm text-muted">
          Controlled manual scanning for real beta testers. When ON, the daily cron skips scanning entirely and users
          scan manually up to the daily limit below — no billing activity is allowed while beta is active.
        </p>
      </div>

      <SectionCard title="Master switch">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm">
              Beta Mode is currently{" "}
              <span className={`font-medium ${settings.enabled ? "text-good" : "text-muted"}`}>{settings.enabled ? "ON" : "OFF"}</span>.
            </p>
            <p className="text-xs text-muted mt-1">
              {settings.enabled
                ? "Daily cron scanning is paused. Manual scans and billing lock are active."
                : "Normal production behavior — daily cron scans automatically, manual scanning is off, billing is normal."}
            </p>
            {settings.updatedByEmail && <p className="text-xs text-muted mt-1">Last changed by {settings.updatedByEmail}.</p>}
          </div>
          <form action={setBetaModeAction}>
            <input type="hidden" name="enabled" value={settings.enabled ? "false" : "true"} />
            <button
              type="submit"
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                settings.enabled ? "border border-line text-ink hover:bg-paper" : "bg-accent text-white hover:opacity-90"
              }`}
            >
              Turn Beta Mode {settings.enabled ? "OFF" : "ON"}
            </button>
          </form>
        </div>
      </SectionCard>

      <SectionCard title="Manual scan limit per user per day">
        <form action={setManualScanLimitAction} className="flex flex-wrap items-center gap-3">
          <select
            name="limit"
            defaultValue={settings.manualScansPerUserPerDay}
            className="rounded-md border border-line bg-paper px-3 py-2 text-sm"
          >
            {SCAN_LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} scan{n === 1 ? "" : "s"}/day
              </option>
            ))}
            {!SCAN_LIMIT_OPTIONS.includes(settings.manualScansPerUserPerDay) && (
              <option value={settings.manualScansPerUserPerDay}>{settings.manualScansPerUserPerDay} scans/day (current)</option>
            )}
          </select>
          <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm hover:bg-paper">
            Save limit
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Emergency controls">
        <div className="flex flex-wrap gap-3">
          <form action={setScanningPausedAction}>
            <input type="hidden" name="paused" value={settings.scanningPaused ? "false" : "true"} />
            <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm hover:bg-paper">
              {settings.scanningPaused ? "Resume beta scanning" : "Pause all beta scanning"}
            </button>
          </form>
          <form action={resetTodaysBetaCountersAction}>
            <button type="submit" className="rounded-md border border-line px-3 py-2 text-sm text-risk hover:bg-risk/5">
              Reset today's scan counters
            </button>
          </form>
        </div>
        {settings.scanningPaused && (
          <p className="text-xs text-caution mt-3">
            Beta scanning is paused — manual scans are blocked even though Beta Mode is ON. Billing stays locked.
          </p>
        )}
      </SectionCard>

      <StatCardRow>
        <StatCard label="Manual scan limit / user / day" value={settings.manualScansPerUserPerDay} />
        <StatCard label="Manual scans used today" value={overview.manualScansUsedToday} />
        <StatCard label="Number of beta users" value={overview.usersWhoEverScanned} sub="ever run a manual scan" />
        <StatCard label="Manual scans today" value={overview.manualScansToday} />
      </StatCardRow>

      <StatCardRow>
        <StatCard label="Opportunities generated (all-time, beta)" value={overview.totalOpportunitiesAllTime} />
        <StatCard label="Estimated provider spend today" value={formatUsd(overview.estimatedSpendTodayUsd)} sub="Reddit/X + Gemini, beta scans only" />
        <StatCard label="Avg opportunities / scan (all-time)" value={overview.avgOpportunitiesPerScanAllTime.toFixed(2)} />
      </StatCardRow>

      <SectionCard title="Beta activity — last 7 days">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted">Manual scans</dt>
          <dd className="sm:text-right">{overview.manualScansThisWeek}</dd>
          <dt className="text-muted">Opportunities generated</dt>
          <dd className="sm:text-right">{overview.opportunitiesThisWeek}</dd>
          <dt className="text-muted">Conversations discovered</dt>
          <dd className="sm:text-right">{overview.conversationsDiscoveredThisWeek}</dd>
          <dt className="text-muted">Gemini requests</dt>
          <dd className="sm:text-right">{overview.geminiRequestsThisWeek}</dd>
          <dt className="text-muted">RedditAPI calls</dt>
          <dd className="sm:text-right">{overview.redditCallsThisWeek}</dd>
          <dt className="text-muted">X/Twitter API calls</dt>
          <dd className="sm:text-right">{overview.twitterCallsThisWeek}</dd>
        </dl>
      </SectionCard>

      <SectionCard title={`Users who scanned today (${overview.usersWhoScannedToday.length})`}>
        {overview.usersWhoScannedToday.length === 0 ? (
          <EmptyState>No manual scans yet today.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {overview.usersWhoScannedToday.map((u) => (
              <div key={u.userId} className="flex items-center justify-between text-sm border-b border-line last:border-b-0 pb-2 last:pb-0">
                <span>{u.email}</span>
                <span className="text-xs font-mono text-muted">
                  {u.usedToday}/{u.usedToday + u.remainingToday} used
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted mt-4">Resets automatically at midnight UTC — {relativeOrNever(settings.updatedAt)} settings last changed.</p>
      </SectionCard>
    </div>
  );
}
