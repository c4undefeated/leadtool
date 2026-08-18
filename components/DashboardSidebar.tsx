"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logOutAction } from "@/lib/actions/auth";

const PRIMARY_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/opportunities", label: "Opportunities", icon: OpportunitiesIcon },
  { href: "/campaigns", label: "Campaigns", icon: CampaignsIcon },
];

const SETTINGS_NAV_ITEMS = [
  { href: "/settings/offer", label: "Offer & ICP Profile", icon: OfferIcon },
  { href: "/settings/notifications", label: "Webhooks & Alerts", icon: BellIcon },
  { href: "/settings/billing", label: "Billing & Usage", icon: BillingIcon },
];

// Rendered ONLY when isAdmin is true (see below) — this is a display
// convenience, not the authorization boundary. Every /admin/* page and
// every admin data query independently re-verifies User.role === "admin"
// server-side (lib/auth.ts's requireAdmin); a customer who guesses one of
// these hrefs directly gets a 404, not this nav item hidden from them.
const ADMIN_NAV_ITEMS = [
  // exact: true — otherwise this item's own prefix-match logic (needed so
  // e.g. "Customers" stays highlighted on a customer detail page) would
  // ALSO keep "Admin Overview" lit up on every other /admin/* page, since
  // they all start with "/admin".
  { href: "/admin", label: "Admin Overview", icon: ShieldIcon, exact: true },
  { href: "/admin/customers", label: "Customers", icon: UsersIcon },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: BillingIcon },
  { href: "/admin/usage", label: "Usage & Costs", icon: GaugeIcon },
  { href: "/admin/health", label: "System Health", icon: PulseIcon },
  { href: "/admin/cron", label: "Scan / Cron Monitor", icon: ClockIcon },
  { href: "/admin/metrics", label: "Engine Metrics", icon: ChartIcon },
  { href: "/admin/activity", label: "Activity / Logs", icon: ListIcon },
];

export function DashboardSidebar({
  companyName,
  userName,
  userEmail,
  isAdmin = false,
}: {
  companyName: string;
  userName: string | null;
  userEmail: string;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — hamburger + wordmark, sidebar itself becomes a slide-in overlay */}
      <div className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/95 backdrop-blur px-4 py-3">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" className="text-ink p-2 -m-2">
          <MenuIcon />
        </button>
        <Link href="/dashboard" className="font-display text-lg">
          Intent<span className="text-accent">Scout</span>
        </Link>
        <span className="w-6" aria-hidden="true" />
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-30 bg-paper/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed md:sticky top-0 z-40 md:z-auto h-dvh md:h-screen w-64 shrink-0 border-r border-line bg-paper flex flex-col transition-transform md:transition-none ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="px-5 py-5 border-b border-line">
          <Link href="/dashboard" className="font-display text-xl block" onClick={() => setOpen(false)}>
            Intent<span className="text-accent">Scout</span>
          </Link>
          <p className="text-xs text-muted font-mono mt-1 truncate">{companyName}</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col gap-1">
            {PRIMARY_NAV_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setOpen(false)} />
            ))}
          </div>

          <div>
            <p className="px-3 pb-1 text-[11px] uppercase tracking-widest text-muted font-mono">Settings &amp; Management</p>
            <div className="flex flex-col gap-1">
              {SETTINGS_NAV_ITEMS.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setOpen(false)} />
              ))}
            </div>
          </div>

          {isAdmin && (
            <div>
              <p className="px-3 pb-1 text-[11px] uppercase tracking-widest text-accent font-mono">Admin</p>
              <div className="flex flex-col gap-1">
                {ADMIN_NAV_ITEMS.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="px-3 py-4 border-t border-line">
          <div className="px-3 pb-3 mb-1 border-b border-line">
            <p className="text-sm text-ink truncate">{userName || "—"}</p>
            <p className="text-xs text-muted font-mono truncate">{userEmail}</p>
          </div>
          <form action={logOutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-surface hover:text-risk transition"
            >
              <LogOutIcon className="shrink-0" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: { href: string; label: string; icon: (props: IconProps) => React.ReactElement; exact?: boolean };
  pathname: string;
  onNavigate: () => void;
}) {
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
        active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface hover:text-ink"
      }`}
    >
      <item.icon className="shrink-0" />
      {item.label}
    </Link>
  );
}

type IconProps = { className?: string };

function MenuIcon({ className }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function DashboardIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="12" width="8" height="9" rx="1.5" />
      <rect x="3" y="15" width="8" height="6" rx="1.5" />
    </svg>
  );
}

function OpportunitiesIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}

function CampaignsIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M16 8a5 5 0 0 1 0 8" />
      <path d="M19 5a9 9 0 0 1 0 14" />
    </svg>
  );
}

function OfferIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 3v5a1 1 0 0 0 1 1h5" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function BellIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10.5 21a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

function BillingIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <line x1="6" y1="15" x2="10" y2="15" />
    </svg>
  );
}

function LogOutIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" />
      <path d="M9.5 12.5l1.8 1.8 3.2-3.6" />
    </svg>
  );
}

function UsersIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 8.2a3 3 0 1 1 3.5 4.6" />
      <path d="M21.5 20c0-2.6-1.6-4.6-4-5.5" />
    </svg>
  );
}

function GaugeIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15l3.5-4.5" />
      <circle cx="12" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}

function PulseIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 12h4l2.5-7 4 14 2.5-9 2 2H22" />
    </svg>
  );
}

function ClockIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function ChartIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-7" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

function ListIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
