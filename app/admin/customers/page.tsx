import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listCustomers } from "@/lib/admin/customers";
import { PLANS, isPlanId } from "@/lib/billing/plans";
import { EmptyState, relativeOrNever } from "@/components/admin/AdminUI";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const { q, page } = await searchParams;
  const search = q ?? "";
  const pageNum = Number(page) || 1;
  const { rows, total, pageSize } = await listCustomers(search, pageNum);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl mb-1">Customers</h1>
        <p className="text-sm text-muted">{total} account{total === 1 ? "" : "s"} total.</p>
      </div>

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search by business name or email…"
          className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border border-line px-4 py-2 text-sm hover:bg-paper">
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState>No customers match this search.</EmptyState>
      ) : (
        <div className="rounded-lg border border-line bg-surface overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Businesses</th>
                <th className="px-4 py-3 font-medium">Owner email</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Count</th>
                <th className="px-4 py-3 font-medium">Opportunities</th>
                <th className="px-4 py-3 font-medium">Last scan</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0 hover:bg-paper">
                  <td className="px-4 py-3">
                    <Link href={`/admin/customers/${c.id}`} className="text-accent font-medium">
                      {c.businessNames.slice(0, 2).join(", ")}
                      {c.businessNames.length > 2 ? ` +${c.businessNames.length - 2}` : ""}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.ownerEmail ?? "—"}</td>
                  <td className="px-4 py-3">{c.plan && isPlanId(c.plan) ? PLANS[c.plan].name : "—"}</td>
                  <td className="px-4 py-3 text-muted">{c.subscriptionStatus ?? "none"}</td>
                  <td className="px-4 py-3">
                    {c.businessCount}
                    {c.plan && isPlanId(c.plan) ? ` / ${PLANS[c.plan].limits.maxBusinesses}` : ""}
                  </td>
                  <td className="px-4 py-3">{c.opportunityCount}</td>
                  <td className="px-4 py-3 text-muted">{relativeOrNever(c.lastScanAt)}</td>
                  <td className="px-4 py-3 text-muted">{c.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {pageNum} of {totalPages}
          </span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link href={`/admin/customers?q=${encodeURIComponent(search)}&page=${pageNum - 1}`} className="rounded-md border border-line px-3 py-1.5 hover:bg-paper">
                ← Previous
              </Link>
            )}
            {pageNum < totalPages && (
              <Link href={`/admin/customers?q=${encodeURIComponent(search)}&page=${pageNum + 1}`} className="rounded-md border border-line px-3 py-1.5 hover:bg-paper">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
