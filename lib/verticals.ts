/**
 * Vertical starter templates. These seed onboarding — suggested subreddits
 * and example offer language — but every field they produce stays
 * editable. "Other" exists so onboarding never blocks a business that
 * doesn't fit the first six. No longer seeds literal keyword phrases: that
 * was the old exact-keyword-monitoring pattern the discovery engine
 * (lib/ai/discovery.ts, generated automatically right after onboarding)
 * replaced — seeding a handful of "looking for a coach"-style phrases
 * alongside it would just be residual noise from the retired architecture.
 */

export type VerticalTemplate = {
  key: string;
  label: string;
  description: string;
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
    seedSubreddits: ["fitness", "personaltraining", "loseit", "xxfitness"],
    exampleWhatYouSell: "1:1 online strength coaching with weekly check-ins",
    exampleProblemsSolved: "Plateaued progress, no structured program, lack of accountability",
    exampleIdealCustomer: "Intermediate lifters who've stalled and want a real program, not a template",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Marketing agencies, freelance marketers, growth consultants.",
    seedSubreddits: ["marketing", "PPC", "SEO", "smallbusiness"],
    exampleWhatYouSell: "Performance marketing management for e-commerce brands",
    exampleProblemsSolved: "Rising CAC, no attribution clarity, agency underperformed",
    exampleIdealCustomer: "DTC brands doing $50k-$500k/mo in revenue",
  },
  {
    key: "web_design",
    label: "Web / Design",
    description: "Web designers, developers, brand/product designers.",
    seedSubreddits: ["webdev", "web_design", "smallbusiness", "Entrepreneur"],
    exampleWhatYouSell: "Custom website design and build for small businesses",
    exampleProblemsSolved: "Outdated site, no mobile version, DIY builder isn't converting",
    exampleIdealCustomer: "Local service businesses with $2k-$10k web budgets",
  },
  {
    key: "consulting",
    label: "Consulting",
    description: "Business, operations, and strategy consultants.",
    seedSubreddits: ["smallbusiness", "Entrepreneur", "startups"],
    exampleWhatYouSell: "Fractional operations consulting for growing service businesses",
    exampleProblemsSolved: "No documented process, growth outpacing systems, founder bottleneck",
    exampleIdealCustomer: "Service businesses with 5-30 employees hitting operational limits",
  },
  {
    key: "real_estate",
    label: "Real Estate",
    description: "Realtors and buyer's/seller's agents.",
    seedSubreddits: ["RealEstate", "FirstTimeHomeBuyer", "personalfinance"],
    exampleWhatYouSell: "Buyer's agent representation for first-time buyers",
    exampleProblemsSolved: "Doesn't know where to start, overwhelmed by the process, no agent yet",
    exampleIdealCustomer: "First-time buyers in a specific metro area",
  },
  {
    key: "home_services",
    label: "Home Services",
    description: "Contractors, remodelers, and trades.",
    seedSubreddits: ["HomeImprovement", "Renovations"],
    exampleWhatYouSell: "Licensed remodeling for kitchens and bathrooms",
    exampleProblemsSolved: "No reliable contractor, prior quote fell through, DIY plan stalled",
    exampleIdealCustomer: "Homeowners with an active renovation budget in a specific region",
  },
  {
    key: "other",
    label: "Other",
    description: "Any other service business — start from a blank profile.",
    seedSubreddits: [],
    exampleWhatYouSell: "",
    exampleProblemsSolved: "",
    exampleIdealCustomer: "",
  },
];

export function getVerticalTemplate(key: string): VerticalTemplate {
  return VERTICAL_TEMPLATES.find((v) => v.key === key) ?? VERTICAL_TEMPLATES[VERTICAL_TEMPLATES.length - 1]!;
}
