/**
 * One-off, throwaway script for the cross-niche X Discovery validation.
 *
 * Creates ONE dedicated, fully isolated Account (zero Stripe fields, zero
 * real users) and, under it, 10 synthetic Company/Offer/Campaign rows — one
 * per vertical from scripts/fixtures/offer.ts — each an X/Twitter campaign
 * with ZERO Keyword rows (so precision-layer contamination can't confound
 * the read on pure X-phrase-discovery quality, matching IntentScout's own
 * X campaign setup). Nothing about this script touches, updates, or reads
 * any existing production Account/Company/Campaign row — every id it
 * creates is brand new.
 *
 * Then runs exactly one live runScanForCampaign() per campaign — the same
 * production path a real "Run scan" click uses, unmodified — sequentially
 * (not concurrent), to keep provider budget/cache behavior identical to a
 * normal single scan.
 *
 * Prints every created id (account/company/offer/campaign) and a funnel
 * summary per vertical at the end. Not part of the permanent test suite;
 * safe to delete once the validation is recorded. Cleanup of the created
 * rows is a separate, deliberate follow-up step — NOT done by this script.
 *
 * Run with: npx tsx --env-file=.env scripts/runCrossNicheXValidation.ts
 */
import { prisma } from "@/lib/prisma";
import { runScanForCampaign } from "@/lib/pipeline";
import {
  EVAL_OFFER,
  PLUMBING_OFFER,
  DENTIST_OFFER,
  ACCOUNTANT_OFFER,
  SAAS_LEADGEN_OFFER,
  REAL_ESTATE_OFFER,
  CLEANING_OFFER,
  PHOTOGRAPHER_OFFER,
  LAWYER_OFFER,
  ECOMMERCE_OFFER,
} from "./fixtures/offer";
import type { Offer } from "@prisma/client";

const VALIDATION_ACCOUNT_NAME = "X-Discovery-Validation";

const VERTICALS: { label: string; companyName: string; offer: Offer }[] = [
  { label: "Fitness coaching", companyName: "Validation - Fitness Coaching", offer: EVAL_OFFER },
  { label: "Plumbing", companyName: "Validation - Plumbing", offer: PLUMBING_OFFER },
  { label: "Dentist", companyName: "Validation - Dentist", offer: DENTIST_OFFER },
  { label: "Accountant", companyName: "Validation - Accountant", offer: ACCOUNTANT_OFFER },
  { label: "SaaS/lead-gen", companyName: "Validation - SaaS Lead-Gen", offer: SAAS_LEADGEN_OFFER },
  { label: "Real estate", companyName: "Validation - Real Estate", offer: REAL_ESTATE_OFFER },
  { label: "Cleaning", companyName: "Validation - Cleaning", offer: CLEANING_OFFER },
  { label: "Photographer", companyName: "Validation - Photographer", offer: PHOTOGRAPHER_OFFER },
  { label: "Lawyer", companyName: "Validation - Lawyer", offer: LAWYER_OFFER },
  { label: "E-commerce", companyName: "Validation - E-commerce", offer: ECOMMERCE_OFFER },
];

async function main() {
  console.log(`Creating dedicated validation Account "${VALIDATION_ACCOUNT_NAME}"...`);
  const account = await prisma.account.create({ data: {} });
  console.log(`  account.id = ${account.id}`);

  const created: { label: string; companyId: string; offerId: string; campaignId: string }[] = [];

  for (const v of VERTICALS) {
    const company = await prisma.company.create({ data: { accountId: account.id, name: v.companyName } });
    const offer = await prisma.offer.create({
      data: {
        companyId: company.id,
        verticalTemplateKey: v.offer.verticalTemplateKey,
        businessType: v.offer.businessType,
        whatYouSell: v.offer.whatYouSell,
        problemsSolved: v.offer.problemsSolved,
        idealCustomer: v.offer.idealCustomer,
        priceRangeMin: v.offer.priceRangeMin,
        priceRangeMax: v.offer.priceRangeMax,
        geography: v.offer.geography,
        excludedAudiences: v.offer.excludedAudiences,
        brandVoice: v.offer.brandVoice,
        engagementStyle: v.offer.engagementStyle,
      },
    });
    const campaign = await prisma.campaign.create({
      data: { companyId: company.id, name: `${v.label} (X validation)`, sourceType: "twitter" },
    });
    created.push({ label: v.label, companyId: company.id, offerId: offer.id, campaignId: campaign.id });
    console.log(`  ${v.label.padEnd(20)} company=${company.id} offer=${offer.id} campaign=${campaign.id}`);
  }

  console.log("\nRunning one live X scan per vertical, sequentially...\n");
  const results: Record<string, unknown>[] = [];
  for (const c of created) {
    console.log(`--- ${c.label} (${c.campaignId}) ---`);
    try {
      const result = await runScanForCampaign(c.campaignId, { trigger: "beta_manual" });
      console.log(JSON.stringify(result, null, 2));
      results.push({ label: c.label, campaignId: c.campaignId, ...result });
    } catch (err) {
      console.error(`Scan failed for ${c.label}:`, err);
      results.push({ label: c.label, campaignId: c.campaignId, error: String(err) });
    }
  }

  console.log("\n=== Created record ids (for later cleanup/reference) ===");
  console.log(JSON.stringify({ accountId: account.id, campaigns: created }, null, 2));

  console.log("\n=== Funnel summary ===");
  console.table(results);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
