import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { PricingTable } from "@/components/PricingTable";

export default async function PricingPage() {
  const user = await getCurrentUser();
  const authenticated = !!user?.companyId;

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-display text-xl">
            Intent<span className="text-accent">Scout</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {user ? (
              <Link href="/dashboard" className="text-ink hover:text-accent transition">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-muted hover:text-ink transition">
                  Log in
                </Link>
                <Link href="/signup" className="rounded-md bg-accent px-4 py-2 text-white hover:opacity-90 transition">
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="px-6 py-16">
        <div className="max-w-3xl mx-auto text-center mb-14">
          <h1 className="font-display text-4xl md:text-5xl leading-tight">Simple pricing for finding real buyers.</h1>
          <p className="mt-4 text-muted text-lg">
            IntentScout automatically scans Reddit and X every day, finds people actively looking for what you
            sell, and tells you why each conversation matters. No manual scanning, no busywork — just prioritized
            opportunities in your feed each morning.
          </p>
        </div>

        <PricingTable authenticated={authenticated} />

        <div className="max-w-3xl mx-auto mt-16 text-center text-sm text-muted">
          <p>
            Every plan starts with a 7-day free trial — no charge until it ends, cancel any time. All plans include
            discovery across Reddit and X/Twitter, automatic daily scanning, and full AI opportunity explanations.
            Higher plans raise how much of it you get, not what you get.
          </p>
        </div>

        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="font-display text-2xl text-center mb-8">Questions</h2>
          <div className="flex flex-col gap-6">
            <Faq q="Do I have to run scans myself?" a="No. IntentScout scans automatically once a day for every active plan — there's no manual scan button to remember to click." />
            <Faq
              q="What happens when my trial ends?"
              a="If you haven't canceled, your card is charged for the plan you started the trial on and your account continues normally. You can cancel any time before the trial ends and you won't be charged."
            />
            <Faq
              q="Can I change plans later?"
              a="Yes — upgrade or downgrade any time from the Billing tab. Changes take effect immediately and Stripe prorates the difference automatically."
            />
            <Faq
              q="What happens to my data if I cancel?"
              a="Your opportunities and campaign history stay intact. Canceling stops future scanning and access at the end of your current billing period — it doesn't delete anything."
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <p className="font-medium text-ink mb-1">{q}</p>
      <p className="text-sm text-muted">{a}</p>
    </div>
  );
}
