import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DashboardSidebar } from "@/components/DashboardSidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.company?.offer) redirect("/onboarding");

  return (
    <div className="min-h-screen md:flex">
      <DashboardSidebar companyName={user.company.name} userName={user.name} userEmail={user.email} />
      <main className="flex-1 min-w-0 px-4 py-8 md:px-8">
        <div className="max-w-5xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
