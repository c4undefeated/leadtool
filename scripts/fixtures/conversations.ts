import type { NormalizedConversation } from "@/lib/sources/types";

export type EvalCase = {
  id: string;
  category:
    | "high-intent"
    | "low-intent"
    | "high-fit-low-intent"
    | "low-fit-high-intent"
    | "ambiguous"
    | "spam"
    | "prohibited-promotion"
    | "stale"
    | "false-positive-risk"
    | "should-return-zero";
  conversation: NormalizedConversation;
  expectOpportunity: boolean;
  /** Optional: assert the safety_label lands in this set, when relevant. */
  expectSafetyIn?: string[];
  notes: string;
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "high-intent-1",
    category: "high-intent",
    expectOpportunity: true,
    notes: "Explicit request for a coach, stated plateau, recent.",
    conversation: {
      source: "manual",
      sourceId: null,
      authorRef: "u/lifter_stuck",
      title: "Looking for an online coach — plateaued for a year",
      originalText:
        "I've been lifting for 3 years but haven't gained any strength in the last 12 months. I think I need someone to actually program this for me instead of winging it. Anyone have a coach they'd recommend? Budget isn't really a concern, I just want results.",
      url: "https://example.com/eval/high-intent-1",
      community: "r/Fitness",
      postedAt: daysAgo(0),
    },
  },
  {
    id: "low-intent-1",
    category: "low-intent",
    expectOpportunity: false,
    notes: "Casual discussion, no request for help or a provider.",
    conversation: {
      source: "manual",
      sourceId: null,
      authorRef: "u/gymrat22",
      title: "PR day!",
      originalText: "Hit a new deadlift PR today, 405 for a single. Feeling good, just wanted to share.",
      url: "https://example.com/eval/low-intent-1",
      community: "r/Fitness",
      postedAt: daysAgo(0),
    },
  },
  {
    id: "high-fit-low-intent-1",
    category: "high-fit-low-intent",
    expectOpportunity: false,
    notes: "Squarely the ICP's topic, but no active buying intent — hypothetical/educational.",
    conversation: {
      source: "manual",
      sourceId: null,
      authorRef: "u/curious_lifter",
      title: "How do online coaches usually structure programs?",
      originalText:
        "Just curious how online coaching actually works day to day. Do they just send a spreadsheet or is there more to it? Not looking to hire anyone, just wondering how the industry works.",
      url: "https://example.com/eval/high-fit-low-intent-1",
      community: "r/Fitness",
      postedAt: daysAgo(0),
    },
  },
  {
    id: "low-fit-high-intent-1",
    category: "low-fit-high-intent",
    expectOpportunity: false,
    notes: "Real buying intent, but for something outside the offer (nutrition-only coaching, not strength).",
    conversation: {
      source: "manual",
      sourceId: null,
      authorRef: "u/newmom23",
      title: "Need a postpartum nutrition coach ASAP",
      originalText:
        "Looking for a nutrition-only coach who specializes in postpartum recovery, not a lifting program — I already have a trainer for that. Recommendations welcome, ready to start this week.",
      url: "https://example.com/eval/low-fit-high-intent-1",
      community: "r/xxfitness",
      postedAt: daysAgo(0),
    },
  },
  {
    id: "ambiguous-1",
    category: "ambiguous",
    expectOpportunity: false,
    notes: "Vague dissatisfaction, no explicit ask — should not be padded into a false opportunity.",
    conversation: {
      source: "manual",
      sourceId: null,
      authorRef: "u/meh_progress",
      title: "Progress has been slow lately",
      originalText: "Feel like my progress has slowed down the past couple months. Not sure what's going on honestly.",
      url: "https://example.com/eval/ambiguous-1",
      community: "r/Fitness",
      postedAt: daysAgo(1),
    },
  },
  {
    id: "spam-1",
    category: "spam",
    expectOpportunity: false,
    notes: "Promotional post from someone else, not a genuine prospect.",
    conversation: {
      source: "manual",
      sourceId: null,
      authorRef: "u/fitcoach_ads",
      title: "Check out my coaching program!!",
      originalText: "I'm a certified coach with 500+ clients. DM me for my program, link in bio, 50% off this week only!!",
      url: "https://example.com/eval/spam-1",
      community: "r/Fitness",
      postedAt: daysAgo(0),
    },
  },
  {
    id: "prohibited-promotion-1",
    category: "prohibited-promotion",
    expectOpportunity: true,
    expectSafetyIn: ["caution", "not_safe"],
    notes: "Genuine intent, but community context implies solicitation isn't welcome — safety should reflect that even though it's a real opportunity.",
    conversation: {
      source: "manual",
      sourceId: null,
      authorRef: "u/plateaued_again",
      title: "Need a coach — please no solicitation, sub rules prohibit it",
      originalText:
        "Been stuck at the same numbers for 8 months. Looking for a real coach, will DM people myself once I have names — please note this subreddit's rules prohibit unsolicited promotion or direct offers in comments.",
      url: "https://example.com/eval/prohibited-promotion-1",
      community: "r/Fitness",
      postedAt: daysAgo(0),
    },
  },
  {
    id: "stale-1",
    category: "stale",
    expectOpportunity: false,
    notes: "Same request as high-intent-1 but 9 months old — recency should push this down or out.",
    conversation: {
      source: "manual",
      sourceId: null,
      authorRef: "u/lifter_stuck_old",
      title: "Looking for an online coach — plateaued for a year",
      originalText:
        "I've been lifting for 3 years but haven't gained any strength in the last 12 months. Anyone have a coach they'd recommend?",
      url: "https://example.com/eval/stale-1",
      community: "r/Fitness",
      postedAt: daysAgo(270),
    },
  },
  {
    id: "false-positive-risk-1",
    category: "false-positive-risk",
    expectOpportunity: false,
    notes: "Mentions a coach and a problem, but has already hired someone — a keyword matcher would false-positive here.",
    conversation: {
      source: "manual",
      sourceId: null,
      authorRef: "u/already_hired",
      title: "Finally hired a coach, feeling good",
      originalText:
        "After months of research I hired a coach last week and I'm really happy with the program so far. Wish I'd done it sooner honestly.",
      url: "https://example.com/eval/false-positive-risk-1",
      community: "r/Fitness",
      postedAt: daysAgo(0),
    },
  },
  {
    id: "should-return-zero-1",
    category: "should-return-zero",
    expectOpportunity: false,
    notes: "Totally unrelated content — sanity check that Scout doesn't force a match.",
    conversation: {
      source: "manual",
      sourceId: null,
      authorRef: "u/random",
      title: "Best pizza in Chicago?",
      originalText: "Visiting Chicago next week, where should I get pizza?",
      url: "https://example.com/eval/should-return-zero-1",
      community: "r/Chicago",
      postedAt: daysAgo(0),
    },
  },
];
