# IntentScout

AI demand-intelligence and assisted-engagement platform. Core promise:
*find people already looking for what you sell.* This repo is the
customer-facing product; internally the repo is still named `leadtool`.

Scout's loop: **Discover → Understand → Score → Explain → Prioritize →
Engagement guidance → Generate response (human sends it) → Track →
(eventually) Learn.**

## What's actually live vs. gated

This matters more than usual for this product, because the whole point is
never pretending to have data or results it doesn't have.

| Piece | Status |
|---|---|
| Public marketing homepage (`/`) | Live — anonymous visitors see it; logged-in users still redirect straight to their dashboard |
| Auth, onboarding, campaigns, pipeline, UI | Fully working, dark theme |
| AI analysis (scoring) + engagement guidance/drafting | Fully working, **requires `GEMINI_API_KEY`** — verified live against real Gemini calls, 10/10 on the eval suite |
| Manual conversation import (Track A / validation) | Fully working, always available |
| Contacted tracking (`contactedAt`/`engagementType`/`finalResponse`) | Fully working — distinct from "draft generated," never set by IntentScout itself |
| Reddit adapter | Code complete, **inert without `REDDITAPIS_API_KEY`**, read-only |
| Website enrichment (auto-suggest keywords/subreddits/exclusions from a URL) | Fully working, requires `GEMINI_API_KEY` — suggestions only, never auto-saved |
| Database | **Live** — Supabase Postgres project `intentscout` (`dalywukhftxlopskrtaq`, us-east-1) |
| Vercel deployment | **Live** — git-integrated, deploys on push to `main` |

### Reddit ingestion: Redditapis, read-only

Reddit's *official* API requires every developer to get pre-approval under
its Responsible Builder Policy, and separately requires explicit written
commercial approval (typically a contract) before any paid product may
read its data — that approval has not been filed from this repo, so V1
doesn't integrate Reddit's official API at all.

Instead, `lib/sources/redditApisAdapter.ts` is backed by **Redditapis**
(`api.redditapis.com`) — a third-party data provider. To be explicit about
what that means: Redditapis is **not** Reddit's official API and is **not**
affiliated with Reddit. Its availability, data provenance, terms, and
continued access are an external dependency IntentScout monitors (see
`lib/providers/redditapis/health.ts`), not something this codebase asserts
or vouches for. IntentScout itself does not attempt to bypass Reddit's
restrictions, rate limits, authentication, bans, or access controls.

The integration is **read-only, permanently**, regardless of what the
provider's API surface otherwise exposes:

- Only documented `GET` endpoints are implemented — subreddit listing,
  keyword search, and the free account/balance check. See
  `lib/providers/redditapis/client.ts` for the exact list.
- Redditapis also documents `/login` (returns live Reddit session cookies),
  `/comment`, `/vote`, and `/dm*` endpoints. **None of these are
  implemented, and none will be** — IntentScout never authenticates as a
  Reddit user and never posts, votes, or messages automatically. Every
  comment/DM draft Scout generates is copy-pasted and sent by a human, same
  as always (see "Mark Contacted" below).
- No customer-facing Reddit OAuth exists or is planned.

Everything provider-specific is isolated behind `RedditSourceAdapter`
(`lib/sources/redditApisAdapter.ts`) and a single client module
(`lib/providers/redditapis/client.ts`) — nothing else in the codebase
constructs a Redditapis URL or reads `REDDITAPIS_API_KEY`. Swapping
providers, or adding direct authorized Reddit access later, means writing
a new adapter, not rewriting analysis, opportunities, or the UI.

**Cost control.** Redditapis is pay-per-call (`$0.002`/read as of this
writing). `lib/providers/redditapis/` adds:

- `costLedger.ts` — every call, priced or free, cached or live, gets a
  `ProviderUsageEvent` row (provider/endpoint/campaign/cost/success).
- `budget.ts` — blocks a call before it happens if it would push lifetime
  recorded spend over `REDDITAPIS_MAX_TEST_SPEND_USD` (default `$0.50`,
  sized around the ~$0.55 initial testing balance), or if live
  `credits_remaining` (via the free `/account/me` check) is too low.
- `health.ts` — polls the free balance endpoint (cached ~2 min, not
  per-request) and reports healthy/warning/critical/unavailable; ingestion
  pauses gracefully on critical/unavailable rather than erroring the UI.
- `cache.ts` — a short-TTL (`ProviderRequestCache`) dedup so an accidental
  double-click doesn't pay for the same request twice.
- The adapter makes **exactly one** provider call per scan — it never
  loops per-subreddit — to keep spend predictable.

Use the **manual import** flow on any campaign at any time to run real
public conversations through the exact same production analysis pipeline,
independent of whether Redditapis is configured or has balance.

Nothing in the product fabricates data to paper over any of this. If
`GEMINI_API_KEY` is missing, analysis fails with a clear, visible error
instead of returning fake scores. If Reddit isn't configured, "Run scan"
is disabled with an explanation instead of silently doing nothing. If a
campaign has never been scanned, the UI says "never — scans run on
demand, not on a schedule" rather than inventing a next-scan time; there
is no scheduler built yet.

## Infrastructure

- **Supabase**: project `intentscout` (`dalywukhftxlopskrtaq`, us-east-1).
  The prior `forgecrew-ai` project was paused to free up quota. Migrations
  are applied directly against the live database (via the Supabase
  connector) and mirrored into `prisma/migrations/` for history — every
  migration in that folder has actually been run against real Postgres,
  never hand-authored and hoped-for.
- **Vercel**: git-integrated deployment, builds from `main` on push.
  `package.json` has `postinstall: prisma generate` so the client
  generates automatically on every build.
- ⚠️ Row Level Security is off on every Supabase table. Low practical risk
  today since the app talks to Postgres directly via Prisma (not through
  Supabase's REST layer with the anon key — nothing in the code uses
  `@supabase/supabase-js`), but worth enabling with real policies before
  any client-side Supabase usage is ever added.

## Setup (local)

```bash
npm install
cp .env.example .env   # fill in GEMINI_API_KEY and Supabase DATABASE_URL/DIRECT_URL
npx prisma migrate dev
npm run dev
```

Env vars — see `.env.example` for the full list and what each unlocks:

- `DATABASE_URL` / `DIRECT_URL` — Supabase Postgres. Pooled vs. direct
  connection, respectively; both from the same project's connection
  settings.
- `SESSION_SECRET` — required, signs auth session cookies.
- `GEMINI_API_KEY` — required for any analysis or drafting.
- `INTENTSCOUT_ANALYSIS_MODEL` / `INTENTSCOUT_ENGAGEMENT_MODEL` — optional,
  both default to `gemini-3.6-flash`.
- `REDDITAPIS_API_KEY` — optional, only needed to enable live Reddit
  ingestion via Redditapis (see above). Server-side only, read-only.
- `REDDITAPIS_MAX_TEST_SPEND_USD` — optional, defaults to `0.50`.

This sandbox specifically cannot make raw Postgres TCP connections
(outbound is HTTPS-only here) — local `prisma migrate`/`next dev` against
the live Supabase DB won't work *from this environment*, though it works
normally anywhere else, including Vercel's build/runtime.

## Architecture

```
SourceAdapter (lib/sources/*)
  → NormalizedConversation        — the only shape analysis/UI ever see
  → AI analysis (lib/ai/analysis.ts)
  → Opportunity                   — intent/fit/match/confidence/safety kept separate
  → Feed / detail UI
  → Engagement guidance (lib/ai/engagement.ts) — on demand, not on ingest
  → Human-approved draft (comment or DM, never auto-sent)
  → Pipeline (lightweight CRM) → Mark Contacted (records how, not that IntentScout sent it)
```

Reddit is `SourceAdapter #1` (`lib/sources/redditApisAdapter.ts`, backed by
Redditapis — see above). A second source plugs in by implementing
`SourceAdapter` (`lib/sources/types.ts`) — nothing in analysis, the
opportunity model, or the UI references a source by name.
`lib/sources/manualAdapter.ts` is the always-available validation track,
not a "real" adapter in the polling sense.

Two AI stages, intentionally separate (`lib/ai/`), both on Gemini via
`@google/genai`, using `responseSchema` structured-output rather than
free-text parsing:

1. **Analysis** (`gemini-3.6-flash` by default) — runs on every ingested
   conversation. Can and does return "not an opportunity" — that's the
   expected, common result, not an error. See `ANALYSIS_PROMPT_VERSION` in
   `lib/ai/schemas.ts`, stored on every `Opportunity` row so prompt
   changes stay evaluable against history.
2. **Engagement guidance** (`gemini-3.6-flash` by default) — runs only
   when a user opens an opportunity and asks for it. Picks exactly one
   recommended channel (public comment, DM, monitor, or don't engage),
   never both, and always returns explicit "avoid" guidance alongside
   whichever draft it produces.

## Validation / eval suite

```bash
npm run eval
```

Runs the real production analysis pipeline (`lib/ai/analysis.ts`) against
fixtures in `scripts/fixtures/` covering high-intent, low-intent,
high-fit/low-intent, low-fit/high-intent, ambiguous, spam,
prohibited-promotion, stale, false-positive-risk, and explicit
should-return-zero cases. Requires `GEMINI_API_KEY`; without it every case
reports `SKIP` rather than a fake pass.

Currently passing 10/10 against live `gemini-3.6-flash`.

## Smoke test

```bash
npm run build && npm run start -- -p 3411   # in one terminal
node scripts/smoke.mjs                      # in another
```

Drives the real signup → onboarding → campaign → manual import →
opportunities-feed → logout journey with Playwright. Branches its
assertions on whether `GEMINI_API_KEY` is set for the running server
process. Needs a reachable `DATABASE_URL`, which this sandbox can't
provide directly — run it somewhere with normal Postgres connectivity.

## What's deliberately not built

No automated posting or DMing anywhere — every draft is copy/paste,
opened against the original conversation, sent by the human, then
recorded via "Mark Contacted." No generic CRM, no mobile app, no
team/agency seats, no conversational Scout chat interface, no automatic
outcome-based re-scoring, no scan scheduler. Outcome data (won/lost,
estimated value, contacted-at, what was actually sent) is captured on
every `Opportunity` from day one so a future version can use it — V1
does not pretend to learn from it yet.
