/**
 * Vertical starter templates (spec section 3 / 5). These seed onboarding —
 * suggested keywords, subreddits, and example offer language — but every
 * field they produce stays editable. "Other" exists so onboarding never
 * blocks a business that doesn't fit the first six.
 */

export type VerticalTemplate = {
  key: string;
  label: string;
  description: string;
  seedKeywords: string[];
  seedSubreddits: string[];
  exampleWhatYouSell: string;
  exampleProblemsSolved: string;
  exampleIdealCustomer: string;
};

export const VERTICAL_TEMPLATES: VerticalTemplate[] = [
  {
    key: "fitness_coaching",
    label: "Fitness / Coaching",
    description: "Personal trainers, online coaches, nutrition coaches.",
    seedKeywords: [
      "looking for a coach",
      "online coaching",
      "personal trainer recommendation",
      "can't gain muscle",
      "need a training program",
    ],
    seedSubreddits: ["fitness", "personaltraining", "loseit", "xxfitness"],
    exampleWhatYouSell: "1:1 online strength coaching with weekly check-ins",
    exampleProblemsSolved: "Plateaued progress, no structured program, lack of accountability",
    exampleIdealCustomer: "Intermediate lifters who've stalled and want a real program, not a template",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Marketing agencies, freelance marketers, growth consultants.",
    seedKeywords: [
      "need a marketing agency",
      "looking for a marketer",
      "help with ads",
      "SEO help",
      "marketing isn't working",
    ],
    seedSubreddits: ["marketing", "PPC", "SEO", "smallbusiness"],
    exampleWhatYouSell: "Performance marketing management for e-commerce brands",
    exampleProblemsSolved: "Rising CAC, no attribution clarity, agency underperformed",
    exampleIdealCustomer: "DTC brands doing $50k-$500k/mo in revenue",
  },
  {
    key: "web_design",
    label: "Web / Design",
    description: "Web designers, developers, brand/product designers.",
    seedKeywords: [
      "need a website built",
      "looking for a web designer",
      "need a developer",
      "website redesign",
      "need a logo",
    ],
    seedSubreddits: ["webdev", "web_design", "smallbusiness", "Entrepreneur"],
    exampleWhatYouSell: "Custom website design and build for small businesses",
    exampleProblemsSolved: "Outdated site, no mobile version, DIY builder isn't converting",
    exampleIdealCustomer: "Local service businesses with $2k-$10k web budgets",
  },
  {
    key: "consulting",
    label: "Consulting",
    description: "Business, operations, and strategy consultants.",
    seedKeywords: [
      "need a consultant",
      "operations are a mess",
      "looking for advice scaling",
      "need help with process",
    ],
    seedSubreddits: ["smallbusiness", "Entrepreneur", "startups"],
    exampleWhatYouSell: "Fractional operations consulting for growing service businesses",
    exampleProblemsSolved: "No documented process, growth outpacing systems, founder bottleneck",
    exampleIdealCustomer: "Service businesses with 5-30 employees hitting operational limits",
  },
  {
    key: "real_estate",
    label: "Real Estate",
    description: "Realtors and buyer's/seller's agents.",
    seedKeywords: [
      "first time home buyer",
      "looking for a realtor",
      "thinking about buying a house",
      "need a real estate agent",
    ],
    seedSubreddits: ["RealEstate", "FirstTimeHomeBuyer", "personalfinance"],
    exampleWhatYouSell: "Buyer's agent representation for first-time buyers",
    exampleProblemsSolved: "Doesn't know where to start, overwhelmed by the process, no agent yet",
    exampleIdealCustomer: "First-time buyers in a specific metro area",
  },
  {
    key: "home_services",
    label: "Home Services",
    description: "Contractors, remodelers, and trades.",
    seedKeywords: [
      "need a contractor",
      "looking for a plumber",
      "quote for renovation",
      "who do you recommend for",
    ],
    seedSubreddits: ["HomeImprovement", "Renovations"],
    exampleWhatYouSell: "Licensed remodeling for kitchens and bathrooms",
    exampleProblemsSolved: "No reliable contractor, prior quote fell through, DIY plan stalled",
    exampleIdealCustomer: "Homeowners with an active renovation budget in a specific region",
  },
  {
    key: "other",
    label: "Other",
    description: "Any other service business — start from a blank profile.",
    seedKeywords: [],
    seedSubreddits: [],
    exampleWhatYouSell: "",
    exampleProblemsSolved: "",
    exampleIdealCustomer: "",
  },
];

export function getVerticalTemplate(key: string): VerticalTemplate {
  return VERTICAL_TEMPLATES.find((v) => v.key === key) ?? VERTICAL_TEMPLATES[VERTICAL_TEMPLATES.length - 1]!;
}
