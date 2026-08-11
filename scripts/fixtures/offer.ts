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
