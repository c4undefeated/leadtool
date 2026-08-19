/**
 * One-off, throwaway script to trigger a real Beta Mode X/Twitter scan
 * against IntentScout's own X campaign, for the live-experiment step of
 * the X-discovery-recall audit (lib/ai/xPhrases.ts's new short/long
 * length-band mix). Calls the exact same production path a real "Run
 * scan" button click does (lib/pipeline.ts's runScanForCampaign) — no
 * shortcuts, no mocked provider calls. Not part of the permanent test
 * suite; safe to delete after the experiment is recorded.
 *
 * Run with: npx tsx --env-file=.env scripts/runLiveXScan.ts <campaignId>
 */
import { runScanForCampaign } from "@/lib/pipeline";

async function main() {
  const campaignId = process.argv[2];
  if (!campaignId) {
    console.error("Usage: npx tsx --env-file=.env scripts/runLiveXScan.ts <campaignId>");
    process.exitCode = 1;
    return;
  }
  console.log(`Running live scan for campaign ${campaignId}...`);
  const result = await runScanForCampaign(campaignId, { trigger: "beta_manual" });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
