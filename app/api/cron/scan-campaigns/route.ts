import { prisma } from "@/lib/prisma";
import { runScanForCampaign, mapWithConcurrency } from "@/lib/pipeline";

// Runs on Vercel's Hobby-tier cron limit — once per day, at an imprecise
// time within the scheduled hour (see vercel.json). This is what closes
// the gap between "results only appear when someone clicks Run scan" and
// leads actually accumulating over time. It does NOT increase how much a
// single scan finds — same one-call-per-campaign, same budget/health
// guards as a manual click — it just removes the "you have to remember to
// click it" step. Real volume growth beyond that needs either a paid plan
// (more frequent cron) or more campaigns/keywords.
export const maxDuration = 60;

const CAMPAIGN_CONCURRENCY = 3;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const campaigns = await prisma.campaign.findMany({
    where: { status: "active", sourceType: { not: "manual" } },
    select: { id: true, name: true },
  });

  const summary: { campaignId: string; name: string; ingested: number; opportunities: number; errors: string[] }[] = [];

  await mapWithConcurrency(campaigns, CAMPAIGN_CONCURRENCY, async (campaign) => {
    try {
      const result = await runScanForCampaign(campaign.id);
      summary.push({
        campaignId: campaign.id,
        name: campaign.name,
        ingested: result.conversationsIngested,
        opportunities: result.opportunitiesCreated,
        errors: result.errors,
      });
    } catch (err) {
      summary.push({
        campaignId: campaign.id,
        name: campaign.name,
        ingested: 0,
        opportunities: 0,
        errors: [err instanceof Error ? err.message : "Unknown error."],
      });
    }
  });

  return Response.json({ scanned: summary.length, results: summary });
}
