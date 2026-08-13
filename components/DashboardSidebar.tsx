"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logOutAction } from "@/lib/actions/auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/opportunities", label: "Opportunities", icon: OpportunitiesIcon },
  { href: "/campaigns", label: "Campaigns", icon: CampaignsIcon },
];

export function DashboardSidebar({ companyName }: { companyName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — hamburger + wordmark, sidebar itself becomes a slide-in overlay */}
      <div className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/95 backdrop-blur px-4 py-3">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" className="text-ink">
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
        className={`fixed md:sticky top-0 z-40 md:z-auto h-screen w-64 shrink-0 border-r border-line bg-paper flex flex-col transition-transform md:transition-none ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="px-5 py-5 border-b border-line">
          <Link href="/dashboard" className="font-display text-xl block" onClick={() => setOpen(false)}>
            Intent<span className="text-accent">Scout</span>
          </Link>
          <p className="text-xs text-muted font-mono mt-1 truncate">{companyName}</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface hover:text-ink"
                }`}
              >
                <item.icon className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-line">
          <form action={logOutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-surface hover:text-risk transition"
            >
              <LogOutIcon className="shrink-0" />
              Log out
            </button>
          </form>
        </div>
      </aside>
    </>
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

function LogOutIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
