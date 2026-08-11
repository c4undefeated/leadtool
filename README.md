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
| AI analysis (scoring) + engagement drafting | Fully working, **requires `ANTHROPIC_API_KEY`** |
| Manual conversation import (Track A / validation) | Fully working, always available |
| Reddit adapter | Code complete, **inert without `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`** |

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

Nothing in the product fabricates data to paper over this gap. If
`ANTHROPIC_API_KEY` is missing, analysis fails with a clear, visible error
instead of returning fake scores. If Reddit isn't configured, "Run scan"
is disabled with an explanation instead of silently doing nothing.

## Setup

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY at minimum
npx prisma migrate dev
npm run dev
```

Env vars — see `.env.example` for the full list and what each unlocks:

- `DATABASE_URL` — SQLite file for local dev. Swap the Prisma datasource
  provider to `postgresql` and point this at a real database for
  production; the schema needs no other changes.
- `SESSION_SECRET` — required, signs auth session cookies.
- `ANTHROPIC_API_KEY` — required for any analysis or drafting.
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

Two AI stages, intentionally separate (`lib/ai/`):

1. **Analysis** — runs on every ingested conversation. Cheap/fast model.
   Can and does return "not an opportunity" — that's the expected, common
   result, not an error. See `ANALYSIS_PROMPT_VERSION` in
   `lib/ai/schemas.ts`, stored on every `Opportunity` row so prompt
   changes stay evaluable against history.
2. **Engagement guidance** — runs only when a user opens an opportunity
   and asks for it. Stronger model, since it's called far less often.

## Validation / eval suite

```bash
npm run eval
```

Runs the real production analysis pipeline (`lib/ai/analysis.ts`) against
fixtures in `scripts/fixtures/` covering high-intent, low-intent,
high-fit/low-intent, low-fit/high-intent, ambiguous, spam,
prohibited-promotion, stale, false-positive-risk, and explicit
should-return-zero cases. Requires `ANTHROPIC_API_KEY`; without it every
case reports `SKIP` rather than a fake pass. Use this before trusting the
scoring in front of a real prospect — the whole product's credibility
rests on the scoring actually being better than a keyword match, and this
is how that gets checked instead of assumed.

## Smoke test

```bash
npm run build && npm run start -- -p 3411   # in one terminal
node scripts/smoke.mjs                      # in another
```

Drives the real signup → onboarding → campaign → manual import →
opportunities-feed → logout journey with Playwright against the pre-installed
Chromium and checks, among other things, that the app fails honestly
(visible error, not a fabricated result) when `ANTHROPIC_API_KEY` is unset.

## What's deliberately not built

No automated posting or DMing anywhere — every draft is copy/paste,
opened against the original conversation, sent by the human. No generic
CRM, no mobile app, no team/agency seats, no conversational Scout chat
interface, no automatic outcome-based re-scoring. Outcome data (won/lost,
estimated value) is captured on every `Opportunity` from day one so a
future version can use it — V1 does not pretend to learn from it yet.
