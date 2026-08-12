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
| Reddit adapter | Code complete, **inert without `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`** |
| Database | **Live** — Supabase Postgres project `intentscout` (`dalywukhftxlopskrtaq`, us-east-1) |
| Vercel deployment | **Live** — git-integrated, deploys on push to `main` |

Reddit ingestion needs more than credentials to be legitimately usable in
production: as of 2026, Reddit requires every developer — including this
one — to get pre-approval under its Responsible Builder Policy, and
separately requires explicit written commercial approval (typically a
contract) before any paid product may read its data, regardless of volume.
That approval has not been filed from this repo. Until it has:

- Use the **manual import** flow on any campaign to run real public
  conversations through the exact same production analysis pipeline.
- The Reddit adapter (`lib/sources/redditAdapter.ts`) is real, working
  code — app-only OAuth, search, rate-limit tracking — but customers never
  see it or need a Reddit account either way, live or not, because nothing
  in V1 posts or messages on Reddit automatically. It only starts running
  once credentials are present.

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
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT` —
  optional, only needed once Reddit approval exists (see above).

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

Reddit is `SourceAdapter #1` (`lib/sources/redditAdapter.ts`). A second
source plugs in by implementing `SourceAdapter` (`lib/sources/types.ts`) —
nothing in analysis, the opportunity model, or the UI references a source
by name. `lib/sources/manualAdapter.ts` is the always-available validation
track, not a "real" adapter in the polling sense.

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
