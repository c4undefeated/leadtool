import Link from "next/link";

const STEPS = [
  {
    n: "01",
    title: "Discover real demand",
    body: "Scout watches the communities and keywords that matter to your business for public posts — not a firehose, a targeted read on the exact conversations your ideal customer would start.",
  },
  {
    n: "02",
    title: "Understand buying intent",
    body: "Every conversation is read for what the person actually needs, not just whether it contains your keywords. Most conversations that mention your topic aren't buying signals — Scout knows the difference.",
  },
  {
    n: "03",
    title: "See why it matters",
    body: "Intent, fit, match, and confidence are scored separately and explained in plain language, alongside a \"why now\" — so you're never taking a lead's word for it, you're taking Scout's reasoning.",
  },
  {
    n: "04",
    title: "Get engagement guidance",
    body: "Scout checks whether the conversation is even safe to engage with, recommends a public comment or a private DM based on context, and drafts one in your brand voice — with a note on what to avoid.",
  },
  {
    n: "05",
    title: "Track what happens",
    body: "Mark an opportunity contacted, replied, qualified, won, or lost. IntentScout keeps the history — what Scout suggested, what you actually sent, and when.",
  },
];

const NOT_LIST = [
  {
    title: "Not a generic AI writer",
    body: "Every draft is grounded in the actual conversation and your specific offer — not a fill-in-the-blank template that could belong to anyone.",
  },
  {
    title: "Not a mass spam tool",
    body: "Scout tells you when NOT to engage. It never posts or messages automatically, and it never optimizes for volume.",
  },
  {
    title: "Not a generic CRM",
    body: "No pipelines to configure, no fields to fill in for contacts that were never real leads. Just the opportunities Scout actually found.",
  },
  {
    title: "Not an automated social bot",
    body: "A human reads every draft, edits it, and sends it — every time. That boundary doesn't move.",
  },
];

export function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <span className="font-display text-xl">
            Intent<span className="text-accent">Scout</span>
          </span>
          <nav className="flex items-center gap-5 text-sm font-mono">
            <Link href="/pricing" className="text-muted hover:text-ink">
              Pricing
            </Link>
            <Link href="/login" className="text-muted hover:text-ink">
              Log In
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-accent text-paper hover:bg-accent-hover px-4 py-2 tracking-wide"
            >
              Start Finding Opportunities
            </Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-5xl px-4 pt-16 pb-20 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
            AI demand intelligence
          </p>
          <h1 className="font-display text-4xl sm:text-5xl leading-[1.1] mb-5 text-balance">
            Find people who are already looking for what you sell.
          </h1>
          <p className="text-muted text-lg mb-8 max-w-xl">
            IntentScout finds public conversations with real buying intent, explains why they
            matter, and helps you respond without wasting your time or damaging your reputation.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/signup"
              className="rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm tracking-wide px-6 py-3"
            >
              Start Finding Opportunities
            </Link>
            <Link href="/login" className="font-mono text-sm text-muted hover:text-ink underline">
              Log In
            </Link>
          </div>
        </div>

        <ExampleCard />
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <p className="font-mono text-xs uppercase tracking-widest text-accent mb-2">How IntentScout works</p>
          <h2 className="font-display text-2xl sm:text-3xl mb-10 max-w-2xl">
            From a keyword to a conversation worth having.
          </h2>
          <div className="flex flex-col">
            {STEPS.map((s) => (
              <div key={s.n} className="grid sm:grid-cols-[3.5rem_1fr] gap-4 py-6 border-t border-line first:border-t-0">
                <span className="font-display text-2xl text-muted">{s.n}</span>
                <div>
                  <h3 className="font-medium mb-1">{s.title}</h3>
                  <p className="text-muted text-sm max-w-xl">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HUMAN APPROVAL */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <div className="rounded-lg border border-accent/40 bg-surface p-8 sm:p-10">
            <p className="font-mono text-xs uppercase tracking-widest text-accent mb-3">
              Human approval remains in control
            </p>
            <h2 className="font-display text-2xl sm:text-3xl mb-4 max-w-xl">
              Scout drafts. You decide. You send.
            </h2>
            <p className="text-muted max-w-2xl">
              IntentScout will never publish a comment or send a message on your behalf. Every
              draft opens in an editable composer next to the original conversation — you read it,
              change what doesn't sound like you, copy it, and send it yourself. That boundary is
              permanent, not a setting you can turn off.
            </p>
          </div>
        </div>
      </section>

      {/* WHY DIFFERENT */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <p className="font-mono text-xs uppercase tracking-widest text-accent mb-2">What IntentScout is not</p>
          <h2 className="font-display text-2xl sm:text-3xl mb-10 max-w-2xl">
            It's a demand-intelligence platform, not another automation tool.
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {NOT_LIST.map((item) => (
              <div key={item.title} className="rounded-lg border border-line bg-surface p-5">
                <p className="font-medium mb-1">
                  <span className="text-risk">✕ </span>
                  {item.title}
                </p>
                <p className="text-muted text-sm">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <h2 className="font-display text-2xl sm:text-3xl mb-4">Know why. Help first. You approve every send.</h2>
          <p className="text-muted mb-8 max-w-lg mx-auto">
            Describe what you sell, and Scout starts looking for the conversations that matter.
          </p>
          <Link
            href="/signup"
            className="inline-block rounded-md bg-accent text-paper hover:bg-accent-hover font-mono text-sm tracking-wide px-6 py-3"
          >
            Start Finding Opportunities
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-8 text-xs font-mono text-muted">
          IntentScout — find people who are already looking for what you sell.
        </div>
      </footer>
    </div>
  );
}

function ExampleCard() {
  return (
    <div>
      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="font-mono text-xs text-muted">r/Fitness · u/plateaued_lifter · 23 min ago</span>
          <span className="pill pill-accent shrink-0">Match 94</span>
        </div>
        <p className="font-serif italic text-ink mb-3">
          "I've plateaued for a year and don't know what I'm doing wrong. Anyone have an online
          coach they'd actually recommend?"
        </p>
        <div className="flex flex-wrap gap-4 mb-3 text-sm font-mono">
          <span className="text-muted">Intent <span className="text-ink font-semibold">96</span></span>
          <span className="text-muted">Fit <span className="text-ink font-semibold">91</span></span>
          <span className="text-muted">Confidence: high</span>
        </div>
        <p className="text-sm text-muted mb-3">
          <span className="font-medium text-ink">Why now: </span>
          Posted 23 minutes ago, explicitly asking for a recommendation.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill pill-good">Safe to engage</span>
          <span className="pill pill-neutral">Public comment</span>
        </div>
      </div>
      <p className="text-xs font-mono text-muted mt-2 text-center">An example opportunity card, not live data.</p>
    </div>
  );
}
