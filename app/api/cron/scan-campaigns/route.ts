import { runDailyScan } from "@/lib/dailyScan";

// Runs on Vercel's Hobby-tier cron limit — once per day, at an imprecise
// time within the scheduled hour (see vercel.json), hard-capped at 60s
// regardless of maxDuration. This is the sole trigger for IntentScout's
// always-on scanning: users no longer click "Run scan" — an ACTIVE
// campaign gets scanned automatically once a day the moment this fires.
// See lib/dailyScan.ts for the actual orchestration (due-checking,
// locking, bounded concurrency, per-campaign failure isolation) — this
// route is intentionally thin, just auth + delegate + respond, so there
// is exactly one place that decides "which campaigns get scanned today."
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const summary = await runDailyScan();
  return Response.json(summary);
}
