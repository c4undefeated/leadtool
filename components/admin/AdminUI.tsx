import type { HealthStatus } from "@/lib/admin/health";

export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex-1 min-w-[160px] p-5 border-b border-line sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs font-mono uppercase tracking-widest text-muted mb-2">{label}</p>
      <p className="font-display text-3xl leading-none">{value}</p>
      {sub && <p className="text-xs text-muted mt-1.5">{sub}</p>}
    </div>
  );
}

export function StatCardRow({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-line bg-surface flex flex-wrap">{children}</div>;
}

const HEALTH_TONE: Record<HealthStatus, string> = {
  healthy: "bg-good/10 text-good",
  warning: "bg-caution/10 text-caution",
  error: "bg-risk/10 text-risk",
  not_configured: "bg-line/40 text-muted",
};

const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  error: "Error",
  not_configured: "Not configured",
};

export function HealthPill({ status }: { status: HealthStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${HEALTH_TONE[status]}`}>{HEALTH_LABEL[status]}</span>;
}

export function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-display text-lg">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted py-6 text-center">{children}</p>;
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function relativeOrNever(d: Date | null): string {
  if (!d) return "never";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
