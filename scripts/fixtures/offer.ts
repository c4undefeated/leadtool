import type { Offer } from "@prisma/client";

/** A representative offer profile the eval fixtures are written against. */
export const EVAL_OFFER: Offer = {
  id: "eval-offer",
  companyId: "eval-company",
  verticalTemplateKey: "fitness_coaching",
  businessType: "Online strength coaching",
  whatYouSell: "1:1 online strength coaching with weekly check-ins and a custom program",
  problemsSolved: "Plateaued progress, no structured program, lack of accountability",
  idealCustomer: "Intermediate lifters who've stalled and want a real program, not a generic template",
  priceRangeMin: 150,
  priceRangeMax: 400,
  geography: null,
  excludedAudiences: "Complete beginners looking for free advice, other coaches",
  brandVoice: "Direct, encouraging, no fluff",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};

/**
 * The exact business used as the worked example for "indirect need"
 * regression cases (conversations.ts) — a general beginner-friendly
 * personal trainer, not EVAL_OFFER's narrower "intermediate lifters only"
 * niche coach. Using EVAL_OFFER for a beginner's post would correctly
 * reject it on fit (EVAL_OFFER explicitly excludes complete beginners) —
 * that's the fit-exclusion logic working as intended, a different concern
 * from what these fixtures test. This offer's own ICP genuinely includes
 * beginners, so a rejection here would mean the indirect-need principle
 * itself failed, not a fit mismatch.
 */
export const INDIRECT_NEED_OFFER: Offer = {
  id: "eval-offer-indirect-need",
  companyId: "eval-company",
  verticalTemplateKey: "fitness_coaching",
  businessType: "Personal training",
  whatYouSell: "1-on-1 personal training with customized workout and nutrition plans",
  problemsSolved: "Helping beginners lose fat and build muscle with a real, structured plan instead of guessing",
  idealCustomer: "Beginners and anyone unsure how to structure their own workouts",
  priceRangeMin: 100,
  priceRangeMax: 300,
  geography: "Online, and in-person around Pinehurst and Southern Pines",
  excludedAudiences: null,
  brandVoice: "Encouraging, approachable",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};
