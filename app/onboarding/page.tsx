import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { VERTICAL_TEMPLATES } from "@/lib/verticals";
import { OnboardingForm } from "@/components/OnboardingForm";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.company?.offer) redirect("/dashboard");

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-widest text-accent mb-2">
          Step 1 of 1 — about 5 minutes
        </p>
        <h1 className="font-display text-3xl mb-2">What do you sell?</h1>
        <p className="text-muted mb-8 max-w-xl">
          Scout uses this to figure out who to look for, what counts as a real match, and how
          to sound like you when it drafts a response.
        </p>
        <OnboardingForm templates={VERTICAL_TEMPLATES} />
      </div>
    </main>
  );
}
