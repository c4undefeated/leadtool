import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { listBusinessesForAccount } from "@/lib/business";
import { checkBusinessCreationAllowed } from "@/lib/billing/entitlements";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.company?.offer) redirect("/onboarding");

  const [businesses, businessCreation] = await Promise.all([
    user.accountId ? listBusinessesForAccount(user.accountId) : [],
    user.accountId ? checkBusinessCreationAllowed(user.accountId) : Promise.resolve({ allowed: false as const }),
  ]);

  return (
    <div className="min-h-screen md:flex">
      <DashboardSidebar
        businesses={businesses}
        activeCompanyId={user.companyId}
        canAddBusiness={businessCreation.allowed}
        userName={user.name}
        userEmail={user.email}
        isAdmin={user.role === "admin"}
      />
      <main className="flex-1 min-w-0 px-4 py-8 md:px-8">
        <div className="max-w-5xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
