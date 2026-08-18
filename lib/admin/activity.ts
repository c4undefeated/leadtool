import { prisma } from "@/lib/prisma";

export type AdminActivityEvent = {
  id: string;
  at: Date;
  kind: "opportunity_activity" | "new_customer" | "billing_event" | "scan_failed";
  summary: string;
  companyName: string | null;
};

const FEED_LIMIT = 100;

/**
 * Composed from existing data rather than a new "admin event log" table —
 * IntentScout has no single unified event-log model today, and building
 * one just for this view would be exactly the kind of duplicate system
 * the spec warns against. Instead this merges four already-persisted
 * signals: Activity (opportunity-level events, existing model),
 * StripeWebhookEvent (billing event type+timestamp, existing idempotency
 * ledger), Company.createdAt (new signups, existing column), and recent
 * failed ScanRun rows. No secrets, tokens, or payment details are read
 * from any of these — StripeWebhookEvent stores only id/type/timestamp,
 * never a Stripe object body.
 */
export async function getAdminActivityFeed(limit = FEED_LIMIT): Promise<AdminActivityEvent[]> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [opportunityActivity, newCompanies, billingEvents, failedScans] = await Promise.all([
    prisma.activity.findMany({
      where: { at: { gte: since } },
      orderBy: { at: "desc" },
      take: limit,
      select: {
        id: true,
        at: true,
        event: true,
        note: true,
        opportunity: { select: { conversation: { select: { campaign: { select: { company: { select: { name: true } } } } } } } },
      },
    }),
    prisma.company.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.stripeWebhookEvent.findMany({
      where: { processedAt: { gte: since } },
      orderBy: { processedAt: "desc" },
      take: limit,
      select: { id: true, type: true, processedAt: true },
    }),
    prisma.campaign.findMany({
      where: { lastScanStatus: "failed", lastScanStartedAt: { gte: since } },
      orderBy: { lastScanStartedAt: "desc" },
      take: limit,
      select: { id: true, name: true, lastScanStartedAt: true, lastScanError: true, company: { select: { name: true } } },
    }),
  ]);

  const events: AdminActivityEvent[] = [
    ...opportunityActivity.map((a) => ({
      id: `activity:${a.id}`,
      at: a.at,
      kind: "opportunity_activity" as const,
      summary: `${a.event}${a.note ? ` — ${a.note}` : ""}`,
      companyName: a.opportunity.conversation.campaign.company.name,
    })),
    ...newCompanies.map((c) => ({
      id: `company:${c.id}`,
      at: c.createdAt,
      kind: "new_customer" as const,
      summary: "New customer signed up",
      companyName: c.name,
    })),
    ...billingEvents.map((e) => ({
      id: `stripe:${e.id}`,
      at: e.processedAt,
      kind: "billing_event" as const,
      summary: `Stripe event: ${e.type}`,
      companyName: null,
    })),
    ...failedScans.map((s) => ({
      id: `scanfail:${s.id}:${s.lastScanStartedAt?.getTime()}`,
      at: s.lastScanStartedAt ?? new Date(0),
      kind: "scan_failed" as const,
      summary: `Scan failed for "${s.name}"${s.lastScanError ? `: ${s.lastScanError}` : ""}`,
      companyName: s.company.name,
    })),
  ];

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return events.slice(0, limit);
}
