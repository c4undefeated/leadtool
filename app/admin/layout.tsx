import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DashboardSidebar } from "@/components/DashboardSidebar";

// A completely separate route tree from app/(dashboard) — not nested
// inside it — so the customer app's layout/guards never accidentally
// apply here and vice versa. This layout is the page-level gate; every
// individual /admin/* page ALSO calls requireAdmin() itself (see
// lib/auth.ts), since a layout only guards navigation, not a server
// action or API route reached some other way.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Deliberately notFound() rather than redirect() for a non-admin: a
  // customer probing /admin gets a plain 404, the same as any other route
  // that doesn't exist for them — no confirmation the admin panel exists,
  // no "you're not allowed" message to react to. This is a UX/obscurity
  // choice on top of the real, unconditional server-side check
  // (requireAdmin) — never the authorization boundary itself.
  if (user.role !== "admin") notFound();

  return (
    <div className="min-h-screen md:flex">
      <DashboardSidebar companyName="IntentScout — Admin" userName={user.name} userEmail={user.email} isAdmin />
      <main className="flex-1 min-w-0 px-4 py-8 md:px-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <span className="pill pill-caution">ADMIN / INTERNAL</span>
            <span className="text-xs text-muted font-mono">Not visible to customers — internal operator view only.</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
