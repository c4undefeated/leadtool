# IntentScout

AI demand-intelligence platform. Core promise: *find people already looking
for what you sell.* This repo is the customer-facing product; internally
the repo is still named `leadtool`.

Scout's loop: **Discover → Understand → Score → Explain → Prioritize →
Recommend engagement → Generate response → Track → (eventually) Learn.**

## What's actually live vs. gated

This matters more than usual for this product, because the whole point is
never pretending to have data or results it doesn't have.

| Piece | Status |
|---|---|
| Auth, onboarding, campaigns, pipeline, UI | Fully working |
| AI analysis (scoring) + engagement drafting | Fully working, **requires `GEMINI_API_KEY`** — verified live against real Gemini calls |
| Manual conversation import (Track A / validation) | Fully working, always available |
| Reddit adapter | Code complete, **inert without `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`** |
| Database | **Not yet provisioned** — schema targets Supabase Postgres, no live project connected from this repo yet |
| Vercel deployment | **Not yet created** — app is deploy-ready, no Vercel project exists yet |

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
is disabled with an explanation instead of silently doing nothing.

## Infrastructure status (Supabase / Vercel)

The intent is: Supabase for the database, deployed on Vercel, with the
`forgecrew-ai` Supabase project paused first to free up project quota.
**None of the account-level provisioning has been done from this session** —
the Supabase and Vercel connectors weren't available here, and there's no
`supabase`/`vercel` CLI auth in this environment either. Nothing was
guessed at or faked in place of it. What's ready on the code side:

- `prisma/schema.prisma` targets `postgresql`, with `DATABASE_URL` (pooled,
  port 6543) and `DIRECT_URL` (direct, port 5432) — Supabase's documented
  pattern for Prisma. See `.env.example`.
- `package.json` has a `postinstall: prisma generate` so a Vercel build
  generates the Prisma client automatically.
- No migration is committed yet (see `prisma/migrations/README.md`) —
  the schema was never run against a real Postgres engine from this
  session, so a hand-authored migration file would be an unverified guess.
  The first real step once a Supabase project exists is `npx prisma
  migrate dev --name init` against its connection strings, which generates
  and applies the actual migration.

Still needed, and blocked on the Supabase/Vercel connectors being
reconnected (or the info handed over manually):

1. Pause the `forgecrew-ai` Supabase project.
2. Create the new Supabase project for IntentScout, grab its pooled +
   direct connection strings.
3. `npx prisma migrate dev --name init` against them.
4. Create a new Vercel project from this repo, set `DATABASE_URL`,
   `DIRECT_URL`, `SESSION_SECRET`, `GEMINI_API_KEY` (and Reddit vars once
   applicable) as Vercel env vars, deploy.

## Setup (local)

```bash
npm install
cp .env.example .env   # fill in GEMINI_API_KEY and Supabase DATABASE_URL/DIRECT_URL
npx prisma migrate dev --name init
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

## Architecture

```
SourceAdapter (lib/sources/*)
  → NormalizedConversation        — the only shape analysis/UI ever see
  → AI analysis (lib/ai/analysis.ts)
  → Opportunity                   — intent/fit/match/confidence/safety kept separate
  → Feed / detail UI
  → Engagement guidance (lib/ai/engagement.ts) — on demand, not on ingest
  → Pipeline (lightweight CRM)
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
   when a user opens an opportunity and asks for it.

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

Currently passing 10/10 against live `gemini-3.6-flash`. Worth knowing:
the first run caught a real miss — a 9-month-old post was still scored as
live buying intent, because the model had no reference point for "now."
Fixed by passing the current timestamp into the prompt explicitly and
making staleness a hard discount rather than one factor among many — a
genuine example of what this eval suite is for, not a one-time fixup.

## Smoke test

```bash
npm run build && npm run start -- -p 3411   # in one terminal
node scripts/smoke.mjs                      # in another
```

Drives the real signup → onboarding → campaign → manual import →
opportunities-feed → logout journey with Playwright against the
pre-installed Chromium. Branches its assertions on whether
`GEMINI_API_KEY` is set for the running server process, so it stays
correct either way. **Requires a real, reachable `DATABASE_URL`** — it
hasn't been re-run since the Postgres/Supabase switch, since no live
database is provisioned from this session yet (see Infrastructure status
above). Re-run it once Supabase is connected.

## What's deliberately not built

No automated posting or DMing anywhere — every draft is copy/paste,
opened against the original conversation, sent by the human. No generic
CRM, no mobile app, no team/agency seats, no conversational Scout chat
interface, no automatic outcome-based re-scoring. Outcome data (won/lost,
estimated value) is captured on every `Opportunity` from day one so a
future version can use it — V1 does not pretend to learn from it yet.
