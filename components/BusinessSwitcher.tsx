"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { switchBusinessAction } from "@/lib/actions/business";
import type { BusinessSummary } from "@/lib/business";

export function BusinessSwitcher({
  businesses,
  activeCompanyId,
  canAddBusiness,
}: {
  businesses: BusinessSummary[];
  activeCompanyId: string | null;
  canAddBusiness: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = businesses.find((b) => b.id === activeCompanyId);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-muted font-mono mt-1 hover:text-ink transition max-w-full"
      >
        <span className="truncate">{active?.name ?? "Select business"}</span>
        <ChevronIcon className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 max-w-[80vw] rounded-md border border-line bg-paper shadow-lg z-50 py-1">
          {businesses.map((b) => (
            <form key={b.id} action={switchBusinessAction}>
              <input type="hidden" name="companyId" value={b.id} />
              <button
                type="submit"
                className={`w-full text-left px-3 py-2 text-sm truncate hover:bg-surface transition ${
                  b.id === activeCompanyId ? "text-accent font-medium" : "text-ink"
                }`}
              >
                {b.name}
                {b.id === activeCompanyId && <span className="ml-1.5 text-xs text-muted">(active)</span>}
              </button>
            </form>
          ))}
          <div className="border-t border-line mt-1 pt-1">
            {canAddBusiness ? (
              <Link
                href="/business/new"
                onClick={() => setOpen(false)}
                className="block w-full text-left px-3 py-2 text-sm text-accent hover:bg-surface transition"
              >
                + Add Business
              </Link>
            ) : (
              <Link
                href="/settings/billing"
                onClick={() => setOpen(false)}
                className="block w-full text-left px-3 py-2 text-sm text-muted hover:bg-surface transition"
              >
                Upgrade to add another business →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
