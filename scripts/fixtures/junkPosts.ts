import type { NormalizedConversation } from "@/lib/sources/types";

export type JunkFilterCase = {
  id: string;
  conversation: NormalizedConversation;
  expectJunk: boolean;
  notes: string;
};

function nc(partial: Partial<NormalizedConversation>): NormalizedConversation {
  return {
    source: "reddit",
    sourceId: "t3_test",
    authorRef: "u/test",
    title: null,
    originalText: "",
    url: "https://example.com/junk-filter-fixture",
    community: "r/test",
    postedAt: new Date(),
    ...partial,
  };
}

export const JUNK_FILTER_CASES: JunkFilterCase[] = [
  // --- true positives: deleted/removed ---
  {
    id: "deleted-body-exact",
    expectJunk: true,
    notes: "Body is exactly [deleted].",
    conversation: nc({ originalText: "[deleted]" }),
  },
  {
    id: "removed-title-exact",
    expectJunk: true,
    notes: "Title is exactly [removed]; body alone is long enough to otherwise pass.",
    conversation: nc({ title: "[removed]", originalText: "some body text here that is long enough to pass the word count check" }),
  },
  {
    id: "removed-by-moderator",
    expectJunk: true,
    notes: "Body is exactly [removed by moderator].",
    conversation: nc({ originalText: "[removed by moderator]" }),
  },

  // --- true positives: too short ---
  {
    id: "too-short-3-words",
    expectJunk: true,
    notes: "3 words total, well under the 8-word minimum.",
    conversation: nc({ title: "help", originalText: "need advice pls" }),
  },
  {
    id: "too-short-boundary-7-words",
    expectJunk: true,
    notes: "Exactly 7 words — one below the minimum, must still be junk.",
    conversation: nc({ originalText: "one two three four five six seven" }),
  },
  {
    id: "empty-post",
    expectJunk: true,
    notes: "No title, empty body — zero words.",
    conversation: nc({ title: null, originalText: "" }),
  },

  // --- true positives: spam patterns (case-insensitive) ---
  {
    id: "spam-link-in-bio",
    expectJunk: true,
    notes: 'Contains "link in bio".',
    conversation: nc({ originalText: "check out my page, link in bio for more info please" }),
  },
  {
    id: "spam-promo-code",
    expectJunk: true,
    notes: 'Contains "use promo code".',
    conversation: nc({ originalText: "use promo code SAVE20 today for a discount on everything" }),
  },
  {
    id: "spam-50-percent-off",
    expectJunk: true,
    notes: 'Contains "50% off".',
    conversation: nc({ originalText: "everything is 50% off this weekend only come check it out" }),
  },
  {
    id: "spam-dm-for-rates",
    expectJunk: true,
    notes: 'Contains "dm for rates".',
    conversation: nc({ originalText: "dm for rates and packages available right now today" }),
  },
  {
    id: "spam-whatsapp",
    expectJunk: true,
    notes: 'Contains "whatsapp:".',
    conversation: nc({ originalText: "contact me on whatsapp: 12345 for more details please" }),
  },
  {
    id: "spam-case-insensitive",
    expectJunk: true,
    notes: "Same spam phrase, uppercase — the check must be case-insensitive.",
    conversation: nc({ originalText: "CHECK MY PAGE, LINK IN BIO for the best deals ever" }),
  },
  {
    id: "spam-pattern-inside-otherwise-long-real-looking-text",
    expectJunk: true,
    notes: "A spam phrase buried inside an otherwise plausible, long post — must still be caught.",
    conversation: nc({
      originalText:
        "I've been struggling with my fitness goals for months and finally found something that works. Use promo code FIT30 to get started on your own journey today, it changed my life honestly.",
    }),
  },

  // --- true positives: bot/meta marker ---
  {
    id: "bot-marker-automod",
    expectJunk: true,
    notes: "AutoModerator disclosure boilerplate.",
    conversation: nc({
      originalText: "I am a bot, and this action was performed automatically. Please contact the moderators of this subreddit if you have any questions.",
    }),
  },

  // --- false positives to guard against: must NOT be flagged junk ---
  {
    id: "exactly-8-words-boundary",
    expectJunk: false,
    notes: "Exactly 8 words — the minimum, must pass.",
    conversation: nc({ originalText: "one two three four five six seven eight" }),
  },
  {
    id: "genuine-high-intent-post",
    expectJunk: false,
    notes: "Real, on-topic buying-intent post — must reach Gemini.",
    conversation: nc({
      title: "Need a coach",
      originalText: "Looking for an online strength coach, I've plateaued for months now and need real programming.",
    }),
  },
  {
    id: "null-title-decent-body",
    expectJunk: false,
    notes: "No title at all, but the body alone clears the word count with real content.",
    conversation: nc({ title: null, originalText: "Does anyone have recommendations for a good personal trainer near me who works with beginners" }),
  },
  {
    id: "near-miss-bio-mention",
    expectJunk: false,
    notes: 'Mentions "bio" without the exact "link in bio" phrase — must not false-positive on a substring.',
    conversation: nc({ originalText: "My bio says I'm a nurse but honestly I want a total career change into fitness coaching" }),
  },
  {
    id: "near-miss-promo-code-mention",
    expectJunk: false,
    notes: 'Mentions "promo code" without "use promo code" — must not false-positive.',
    conversation: nc({ originalText: "Does this gym ever send out a promo code for new members, I can never find one anywhere" }),
  },
  {
    id: "near-miss-percentage-mention",
    expectJunk: false,
    notes: 'Mentions a percentage without "50% off" — must not false-positive.',
    conversation: nc({ originalText: "I've lost about 50% of my strength since my injury and I'm not sure how to build it back up" }),
  },
  {
    id: "near-miss-rates-mention",
    expectJunk: false,
    notes: 'Asks about rates without "dm for rates" — must not false-positive.',
    conversation: nc({ originalText: "What are typical hourly rates for an in-person personal trainer in a big city these days" }),
  },
];
