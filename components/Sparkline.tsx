/** Pure SVG trendline — no charting dependency needed for 14 points. */
export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2 || data.every((v) => v === 0)) {
    return <div className={className} />;
  }
  const w = 100;
  const h = 32;
  const max = Math.max(...data);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
