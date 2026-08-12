"use client";

import { useState } from "react";

type Point = { date: string; contacted: number; replied: number };

export function ActivityChart({ series }: { series: Point[] }) {
  const [range, setRange] = useState<7 | 30>(30);
  const points = range === 7 ? series.slice(-7) : series;

  const totalContacted = points.reduce((a, p) => a + p.contacted, 0);
  const totalReplied = points.reduce((a, p) => a + p.replied, 0);
  const replyRate = totalContacted === 0 ? null : Math.round((totalReplied / totalContacted) * 100);

  const max = Math.max(1, ...points.map((p) => p.contacted + p.replied));
  const hasAnyActivity = totalContacted > 0 || totalReplied > 0;

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-medium text-sm">Engagement activity</h2>
          <p className="text-xs text-muted mt-0.5">Marked contacted vs. replied, over time</p>
        </div>
        <div className="flex items-center gap-4">
          {replyRate !== null && (
            <div className="text-right">
              <p className="font-display text-xl leading-none">{replyRate}%</p>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted">Reply rate</p>
            </div>
          )}
          <div className="flex rounded-md border border-line overflow-hidden text-xs font-mono">
            <button
              type="button"
              onClick={() => setRange(30)}
              className={`px-2.5 py-1.5 ${range === 30 ? "bg-accent text-paper" : "hover:bg-paper"}`}
            >
              30d
            </button>
            <button
              type="button"
              onClick={() => setRange(7)}
              className={`px-2.5 py-1.5 ${range === 7 ? "bg-accent text-paper" : "hover:bg-paper"}`}
            >
              7d
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono text-muted mb-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-accent" /> Contacted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-good" /> Replied
        </span>
      </div>

      {hasAnyActivity ? (
        <div className="flex items-end gap-[3px] h-28">
          {points.map((p) => (
            <div key={p.date} className="flex-1 flex flex-col justify-end gap-[2px] h-full" title={p.date}>
              {p.replied > 0 && (
                <div className="bg-good rounded-sm" style={{ height: `${(p.replied / max) * 100}%`, minHeight: 2 }} />
              )}
              {p.contacted > 0 && (
                <div className="bg-accent rounded-sm" style={{ height: `${(p.contacted / max) * 100}%`, minHeight: 2 }} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted py-8 text-center">
          Nothing marked contacted yet in this window — that's expected until you've sent something.
        </p>
      )}
    </div>
  );
}
