import { Sparkline } from "./Sparkline";
import type { Trend } from "@/lib/dashboardStats";

export function StatTile({ label, trend }: { label: string; trend: Trend }) {
  const hasHistory = trend.series.some((v) => v > 0);

  return (
    <div className="flex-1 min-w-[180px] p-5 border-b border-line sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs font-mono uppercase tracking-widest text-muted mb-2">{label}</p>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-3xl leading-none">{trend.value}</p>
          <p className="text-xs mt-1.5">
            {trend.deltaPercent === null ? (
              <span className="text-muted">{hasHistory ? "New this week" : "No activity yet"}</span>
            ) : (
              <>
                <span className={trend.deltaPercent >= 0 ? "text-good" : "text-risk"}>
                  {trend.deltaPercent >= 0 ? "▲" : "▼"} {Math.abs(Math.round(trend.deltaPercent))}%
                </span>{" "}
                <span className="text-muted">vs last week</span>
              </>
            )}
          </p>
        </div>
        {hasHistory && <Sparkline data={trend.series} className="w-20 h-8 text-accent shrink-0" />}
      </div>
    </div>
  );
}
