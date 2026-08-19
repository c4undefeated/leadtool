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

/**
 * A deliberately non-fitness vertical — residential/emergency plumbing —
 * used only to prove IntentScout's X/Twitter discovery engine (and the
 * shared Gemini qualification engine behind it) is genuinely
 * vertical-agnostic, not fitness-specific. See conversations.ts's
 * "x-*" fixtures and scripts/testXPhraseGeneration.ts.
 */
export const PLUMBING_OFFER: Offer = {
  id: "eval-offer-plumbing",
  companyId: "eval-company-plumbing",
  verticalTemplateKey: "home_services",
  businessType: "Residential plumbing and emergency repair",
  whatYouSell: "Same-day residential plumbing repair — leaks, clogged drains, water heater repair/replacement, burst pipes",
  problemsSolved: "Active leaks, clogged or slow drains, no hot water, burst or frozen pipes, failing water heaters",
  idealCustomer: "Homeowners with an active plumbing problem who need it fixed quickly, not DIYers doing routine maintenance",
  priceRangeMin: 150,
  priceRangeMax: 2000,
  geography: "Within 25 miles of Columbus, OH",
  excludedAudiences: "Commercial/industrial plumbing, new-construction plumbing bids",
  brandVoice: "Straightforward, reassuring, no upsell pressure",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};

/**
 * Nine additional non-fitness, non-plumbing verticals, used only by
 * scripts/testXPhraseLengthMix.ts to prove the X phrase generator's
 * short/long length-band mix (lib/ai/xPhrases.ts) is genuinely
 * vertical-agnostic — no code path branches on any of these, they exist
 * purely as synthetic Offer inputs to the same generateXPhrases() call
 * every real campaign goes through.
 */
export const DENTIST_OFFER: Offer = {
  id: "eval-offer-dentist",
  companyId: "eval-company-dentist",
  verticalTemplateKey: "other",
  businessType: "General and cosmetic dentistry practice",
  whatYouSell: "General dental checkups, fillings, root canals, whitening, and emergency dental care",
  problemsSolved: "Tooth pain, cracked or broken teeth, cavities, discolored teeth, no dentist since moving",
  idealCustomer: "Local adults without a regular dentist, or anyone with an active dental problem needing prompt care",
  priceRangeMin: 100,
  priceRangeMax: 3000,
  geography: "Within 15 miles of Austin, TX",
  excludedAudiences: "Oral surgery referrals requiring a specialist, pediatric-only cases",
  brandVoice: "Calm, reassuring, low-pressure",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};

export const ACCOUNTANT_OFFER: Offer = {
  id: "eval-offer-accountant",
  companyId: "eval-company-accountant",
  verticalTemplateKey: "consulting",
  businessType: "Small business bookkeeping and tax preparation",
  whatYouSell: "Monthly bookkeeping, quarterly tax filings, and year-end tax prep for small businesses and freelancers",
  problemsSolved: "Messy or behind-on bookkeeping, missed tax deadlines, no idea what's deductible, dreading tax season",
  idealCustomer: "Small business owners and freelancers who've fallen behind on their books or are overwhelmed by taxes",
  priceRangeMin: 200,
  priceRangeMax: 1500,
  geography: null,
  excludedAudiences: "Large enterprises needing a full in-house finance team, audit representation",
  brandVoice: "Plain-spoken, patient, no jargon",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};

export const SAAS_LEADGEN_OFFER: Offer = {
  id: "eval-offer-saas-leadgen",
  companyId: "eval-company-saas-leadgen",
  verticalTemplateKey: "marketing",
  businessType: "AI-powered social listening and lead-generation SaaS",
  whatYouSell: "Software that monitors Reddit and X for public posts showing buying intent and drafts context-aware responses to review and send",
  problemsSolved: "Manually searching social platforms for prospects, missing buying-intent posts, cold outreach getting ignored",
  idealCustomer: "Founders, freelancers, and small agencies who want inbound-style leads from organic social conversations instead of cold outreach",
  priceRangeMin: 29,
  priceRangeMax: 299,
  geography: null,
  excludedAudiences: "Enterprise accounts needing a dedicated CSM, paid-ads-only marketers",
  brandVoice: "Direct, technical, no hype",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};

export const REAL_ESTATE_OFFER: Offer = {
  id: "eval-offer-real-estate",
  companyId: "eval-company-real-estate",
  verticalTemplateKey: "real_estate",
  businessType: "Buyer's and seller's real estate agent",
  whatYouSell: "Full-service home buying and selling representation, from listing/showings through closing",
  problemsSolved: "Ready to sell but don't know where to start, house hunting with no agent, confused about the offer/closing process",
  idealCustomer: "First-time buyers and sellers in the local market who don't yet have an agent",
  priceRangeMin: null,
  priceRangeMax: null,
  geography: "Within Denver metro, CO",
  excludedAudiences: "Commercial real estate, out-of-state buyers not relocating here",
  brandVoice: "Warm, knowledgeable, unhurried",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};

export const CLEANING_OFFER: Offer = {
  id: "eval-offer-cleaning",
  companyId: "eval-company-cleaning",
  verticalTemplateKey: "other",
  businessType: "Residential house cleaning service",
  whatYouSell: "Recurring and one-time deep house cleaning for homes and apartments",
  problemsSolved: "No time to clean, move-out/move-in cleaning needed, house is a mess before guests arrive",
  idealCustomer: "Busy households and renters who want reliable recurring cleaning or a one-off deep clean",
  priceRangeMin: 80,
  priceRangeMax: 400,
  geography: "Within 20 miles of Tampa, FL",
  excludedAudiences: "Commercial/office cleaning, post-construction cleanup",
  brandVoice: "Friendly, dependable",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};

export const PHOTOGRAPHER_OFFER: Offer = {
  id: "eval-offer-photographer",
  companyId: "eval-company-photographer",
  verticalTemplateKey: "other",
  businessType: "Wedding and portrait photographer",
  whatYouSell: "Wedding-day photography packages and individual/family portrait sessions",
  problemsSolved: "Getting married and don't have a photographer booked, want family photos but haven't found the right style",
  idealCustomer: "Engaged couples planning a wedding, and families wanting portrait sessions",
  priceRangeMin: 500,
  priceRangeMax: 5000,
  geography: "Within 50 miles of Nashville, TN",
  excludedAudiences: "Commercial/product photography, real estate photography",
  brandVoice: "Warm, artistic, personal",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};

export const LAWYER_OFFER: Offer = {
  id: "eval-offer-lawyer",
  companyId: "eval-company-lawyer",
  verticalTemplateKey: "other",
  businessType: "Family law attorney",
  whatYouSell: "Divorce, custody, and family law representation and consultations",
  problemsSolved: "Going through a divorce, custody dispute, need a lawyer but don't know where to start, overwhelmed by paperwork",
  idealCustomer: "People currently facing a divorce or custody situation who don't yet have representation",
  priceRangeMin: 200,
  priceRangeMax: 10000,
  geography: "Licensed and practicing in Illinois",
  excludedAudiences: "Criminal defense, immigration law, business litigation",
  brandVoice: "Compassionate but direct",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};

export const ECOMMERCE_OFFER: Offer = {
  id: "eval-offer-ecommerce",
  companyId: "eval-company-ecommerce",
  verticalTemplateKey: "other",
  businessType: "Direct-to-consumer sustainable home goods brand",
  whatYouSell: "Sustainable, plastic-free kitchen and home goods sold online",
  problemsSolved: "Tired of single-use plastic in the kitchen, looking for eco-friendly alternatives to everyday products",
  idealCustomer: "Environmentally-conscious shoppers looking to replace plastic household items",
  priceRangeMin: 10,
  priceRangeMax: 150,
  geography: null,
  excludedAudiences: "Wholesale/bulk B2B buyers, dropshippers",
  brandVoice: "Warm, values-driven, not preachy",
  engagementStyle: "helpful_first",
  updatedAt: new Date(),
};
