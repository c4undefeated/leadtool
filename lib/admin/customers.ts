import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 25;

export type CustomerListRow = {
  id: string;
  name: string;
  ownerEmail: string | null;
  createdAt: Date;
  plan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  opportunityCount: number;
  campaignCount: number;
  lastScanAt: Date | null;
};

export type CustomerListResult = {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** Server-side paginated + searched — never fetches the full company table (spec section 17). */
export async function listCustomers(search: string, page: number): Promise<CustomerListResult> {
  const where = search.trim()
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { users: { some: { email: { contains: search, mode: "insensitive" as const } } } },
        ],
      }
    : {};

  const safePage = Math.max(1, page);
  const [total, companies] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        createdAt: true,
        plan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        users: { select: { email: true }, take: 1, orderBy: { createdAt: "asc" } },
        _count: { select: { campaigns: true } },
        campaigns: { select: { lastScanAt: true }, orderBy: { lastScanAt: "desc" }, take: 1 },
      },
    }),
  ]);

  // Per-company opportunity counts for just this page of companies (bounded
  // to PAGE_SIZE companies, not a full-table scan). Opportunity has no
  // direct companyId column (it's reached via conversation -> campaign ->
  // company), so this is a row fetch + in-memory tally rather than a
  // single groupBy — still cheap since it's scoped to this page only.
  const companyIds = companies.map((c) => c.id);
  const opportunityRows = companyIds.length
    ? await prisma.opportunity.findMany({
        where: { conversation: { campaign: { companyId: { in: companyIds } } } },
        select: { conversation: { select: { campaign: { select: { companyId: true } } } } },
      })
    : [];
  const oppCountByCompany = new Map<string, number>();
  for (const o of opportunityRows) {
    const id = o.conversation.campaign.companyId;
    oppCountByCompany.set(id, (oppCountByCompany.get(id) ?? 0) + 1);
  }

  const rows: CustomerListRow[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    ownerEmail: c.users[0]?.email ?? null,
    createdAt: c.createdAt,
    plan: c.plan,
    subscriptionStatus: c.subscriptionStatus,
    trialEndsAt: c.trialEndsAt,
    opportunityCount: oppCountByCompany.get(c.id) ?? 0,
    campaignCount: c._count.campaigns,
    lastScanAt: c.campaigns[0]?.lastScanAt ?? null,
  }));

  return { rows, total, page: safePage, pageSize: PAGE_SIZE };
}

export type CustomerDetail = {
  id: string;
  name: string;
  createdAt: Date;
  users: { id: string; email: string; name: string | null; role: string; createdAt: Date }[];
  plan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  hasOffer: boolean;
  campaigns: { id: string; name: string; sourceType: string; status: string; lastScanAt: Date | null; lastScanStatus: string | null }[];
  opportunityCount: number;
  lastActivityAt: Date | null;
};

export async function getCustomerDetail(companyId: string): Promise<CustomerDetail | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      offer: { select: { id: true } },
      users: { select: { id: true, email: true, name: true, role: true, createdAt: true } },
      campaigns: {
        select: { id: true, name: true, sourceType: true, status: true, lastScanAt: true, lastScanStatus: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!company) return null;

  const [opportunityCount, lastActivity] = await Promise.all([
    prisma.opportunity.count({ where: { conversation: { campaign: { companyId } } } }),
    prisma.activity.findFirst({
      where: { opportunity: { conversation: { campaign: { companyId } } } },
      orderBy: { at: "desc" },
      select: { at: true },
    }),
  ]);

  return {
    id: company.id,
    name: company.name,
    createdAt: company.createdAt,
    users: company.users,
    plan: company.plan,
    subscriptionStatus: company.subscriptionStatus,
    trialEndsAt: company.trialEndsAt,
    currentPeriodEnd: company.currentPeriodEnd,
    cancelAtPeriodEnd: company.cancelAtPeriodEnd,
    stripeCustomerId: company.stripeCustomerId,
    stripeSubscriptionId: company.stripeSubscriptionId,
    hasOffer: !!company.offer,
    campaigns: company.campaigns,
    opportunityCount,
    lastActivityAt: lastActivity?.at ?? null,
  };
}
