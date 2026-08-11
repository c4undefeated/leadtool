import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logOutAction } from "@/lib/actions/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.company?.offer) redirect("/onboarding");

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-paper/95 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <Link href="/opportunities" className="font-display text-xl">
            Intent<span className="text-accent">Scout</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-mono">
            <Link href="/opportunities" className="hover:text-accent">
              Opportunities
            </Link>
            <Link href="/campaigns" className="hover:text-accent">
              Campaigns
            </Link>
            <span className="text-muted">{user.company.name}</span>
            <form action={logOutAction}>
              <button type="submit" className="text-muted hover:text-risk">
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
