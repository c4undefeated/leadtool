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
| X/Twitter adapter | Code complete, **inert without `TWITTER_API_KEY`**, read-only |
| Website enrichment (auto-suggest keywords/subreddits/exclusions from a URL) | Fully working, requires `GEMINI_API_KEY` — suggestions only, never auto-saved |
| Scheduled scanning | Live — once/day via Vercel Cron (Hobby-plan ceiling), **requires `CRON_SECRET`** set in Vercel; manual "Run scan" still works independently |
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

**Lead recency.** Each campaign has a `maxLeadAgeHours` setting (12 / 24 /
48, defaults to 24 — selector on the campaign page, next to "Run scan").
Redditapis's own time-window param (`t`) is coarse (hour/day/week/month/
year/all) and, per its docs, mainly affects top/controversial sort — not
something precise enough to trust for a 12h/24h/48h cutoff. So the adapter
requests a superset window from the provider, then enforces the real cutoff
itself against each post's actual `created_utc` before anything gets
ingested or analyzed (`lib/sources/redditApisAdapter.ts`).

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

### X/Twitter ingestion: TwitterAPIs, read-only

Same governance, same shape, different provider — `lib/sources/twitterApisAdapter.ts`
and `lib/providers/twitterapis/*` mirror the Reddit integration above
file-for-file, on purpose. TwitterAPIs (`api.twitterapis.com`) is a
third-party data provider, **not** X's official API and **not** affiliated
with X.

Read-only, permanently, same as Reddit:

- Only the documented search endpoint (`GET /twitter/tweet/advanced_search`)
  and the free account/balance check (`GET /account/me`) are implemented.
- TwitterAPIs also documents a "Register Session" / "User Login" endpoint —
  logs into a real X account with a username/password and stores session
  cookies for authenticated actions. This is the exact same credential-
  automation shape as Redditapis's `/login`. **Not implemented, and won't
  be.** Every write endpoint (create/delete tweet, like, retweet, bookmark,
  follow) and every DM endpoint (inbox, conversation, send) is documented
  as requiring that same registered session, so all of them are out of
  scope too — not just the literal write calls.
- No customer-facing X OAuth exists or is planned.

One real platform difference from Reddit, not glossed over: X's advanced
search has no documented "scope to a community" operator — there's no
subreddit-equivalent among its documented operators (`from:`, `to:`,
`since:`, `until:`, `min_faves:`, `lang:`). So a campaign's "Communities"
field simply doesn't apply to X/Twitter campaigns (hidden in that case,
not silently ignored) rather than being mapped to something that isn't
real. Lead recency works exactly like Reddit's — TwitterAPIs' search
returns whatever it returns, and the adapter filters strictly on each
tweet's actual `created_at` before anything is ingested or analyzed.

Pricing: **$0.0008**/search call, account check free, new accounts start
with ~$0.50 free credit — same cost-ledger/budget/health/cache machinery
as Reddit, parameterized by provider (`provider: "twitterapis"` in the
same `ProviderUsageEvent`/`ProviderRequestCache` tables).

A campaign picks **one** source at creation (Reddit, X/Twitter, or
manual) — this product doesn't scan multiple sources from a single
campaign. If both Reddit and Twitter are configured, new campaigns get an
explicit source picker; a campaign created before a second source was
configured can switch off manual via the same kind of one-way "Switch to
live X/Twitter" button as Reddit's.

Nothing in the product fabricates data to paper over any of this. If
`GEMINI_API_KEY` is missing, analysis fails with a clear, visible error
instead of returning fake scores. If a campaign's source isn't configured,
"Run scan" is disabled with an explanation instead of silently doing
nothing. If a campaign has never been scanned, the UI says "never yet"
rather than inventing a next-scan time.

### Scheduled scanning

Active, non-manual campaigns are also scanned automatically once a day —
`app/api/cron/scan-campaigns/route.ts`, wired up via `vercel.json`. This
runs on the Vercel Hobby plan's cron tier deliberately, which is real and
worth knowing about, not glossed over:

- **Once per day, maximum.** Hobby-plan cron jobs cannot run more
  frequently — Vercel rejects a more-frequent schedule at deploy time.
  Upgrading to Pro is what unlocks per-minute schedules.
- **Imprecise timing.** Vercel documents Hobby cron firing within the
  scheduled hour, not at an exact minute — the UI says "auto-scanned once
  daily," not a specific time, because a specific time isn't actually true.
- **Same one-call-per-campaign, same budget/health guards as a manual
  click.** The cron doesn't scan harder or loop more — it calls the exact
  same `runScanForCampaign()` a manual "Run scan" click does, for every
  active campaign, once a day. It removes the "someone has to remember to
  click it" step; it does not increase how much a single scan finds. If
  you're comparing lead volume against a competitor that's clearly polling
  continuously, this is the ceiling that comparison runs into on a free
  plan — the ceiling is provider-call cadence, not this app's logic.
- Protected by `CRON_SECRET` — Vercel sends it as a Bearer token
  automatically once the env var is set; the route 401s without a match,
  since it's a real POST-able endpoint that would otherwise let anyone
  trigger paid provider calls.

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
- `TWITTER_API_KEY` — optional, only needed to enable live X/Twitter
  ingestion via TwitterAPIs (see above). Server-side only, read-only.
- `TWITTER_MAX_TEST_SPEND_USD` — optional, defaults to `0.50`.
- `CRON_SECRET` — required for scheduled scanning to run (see above);
  without it the cron endpoint just 401s and manual "Run scan" is
  unaffected either way.

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
Redditapis — see above); X/Twitter is `SourceAdapter #2`
(`lib/sources/twitterApisAdapter.ts`, backed by TwitterAPIs, same shape).
Another source plugs in the same way, by implementing `SourceAdapter`
(`lib/sources/types.ts`) — nothing in analysis, the opportunity model, or
the UI references a source by name. `lib/sources/manualAdapter.ts` is the
always-available validation track, not a "real" adapter in the polling
sense.

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
outcome-based re-scoring. (Scheduled scanning does exist — see above —
but only once/day on the current Vercel plan; there's still no
sub-daily/continuous polling.) Outcome data (won/lost, estimated value,
contacted-at, what was actually sent) is captured on every `Opportunity`
from day one so a future version can use it — V1 does not pretend to
learn from it yet.
