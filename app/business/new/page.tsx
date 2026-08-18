import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { checkBusinessCreationAllowed, getAccountEntitlements, countBusinesses } from "@/lib/billing/entitlements";
import { PLANS } from "@/lib/billing/plans";
import { NewBusinessForm } from "@/components/NewBusinessForm";

export default async function NewBusinessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.accountId) redirect("/dashboard");

  const [entitlement, entitlements, businessCount] = await Promise.all([
    checkBusinessCreationAllowed(user.accountId),
    getAccountEntitlements(user.accountId),
    countBusinesses(user.accountId),
  ]);

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-widest text-accent mb-2">Add a business</p>
        <h1 className="font-display text-3xl mb-2">Start a new IntentScout workspace.</h1>
        <p className="text-muted mb-8 max-w-xl">
          Each business gets its own completely isolated discovery configuration, opportunities, and AI context —
          switch between them any time from the sidebar.
        </p>

        {entitlement.allowed ? (
          <>
            <p className="text-xs text-muted font-mono mb-4">
              {businessCount} / {entitlements.limits.maxBusinesses} businesses used on your current plan.
            </p>
            <NewBusinessForm />
          </>
        ) : (
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-5">
            <p className="text-sm text-ink mb-3">{entitlement.reason}</p>
            {entitlement.upgradeTo ? (
              <Link
                href="/settings/billing"
                className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Upgrade to {PLANS[entitlement.upgradeTo].name} →
              </Link>
            ) : (
              <Link href="/settings/billing" className="text-accent text-sm font-medium">
                Manage your plan →
              </Link>
            )}
          </div>
        )}

        <Link href="/dashboard" className="block mt-6 text-xs text-muted hover:text-ink">
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}
