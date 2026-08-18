import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 25;

export type CustomerListRow = {
  id: string; // Account id
  ownerEmail: string | null;
  createdAt: Date;
  plan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  businessCount: number;
  businessNames: string[];
  opportunityCount: number;
  lastScanAt: Date | null;
};

export type CustomerListResult = {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * "Customer" is the Account (the subscription owner — spec: multi-
 * business support), not an individual business anymore. Server-side
 * paginated + searched — never fetches the full account table (spec
 * section 17/23).
 */
export async function listCustomers(search: string, page: number): Promise<CustomerListResult> {
  const where = search.trim()
    ? {
        OR: [
          { companies: { some: { name: { contains: search, mode: "insensitive" as const } } } },
          { users: { some: { email: { contains: search, mode: "insensitive" as const } } } },
        ],
      }
    : {};

  const safePage = Math.max(1, page);
  const [total, accounts] = await Promise.all([
    prisma.account.count({ where }),
    prisma.account.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        plan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        users: { select: { email: true }, take: 1, orderBy: { createdAt: "asc" } },
        companies: {
          select: { id: true, name: true, campaigns: { select: { lastScanAt: true }, orderBy: { lastScanAt: "desc" }, take: 1 } },
        },
      },
    }),
  ]);

  const companyIds = accounts.flatMap((a) => a.companies.map((c) => c.id));
  const opportunityRows = companyIds.length
    ? await prisma.opportunity.findMany({
        where: { conversation: { campaign: { companyId: { in: companyIds } } } },
        select: { conversation: { select: { campaign: { select: { companyId: true } } } } },
      })
    : [];
  const companyToAccount = new Map<string, string>();
  for (const a of accounts) for (const c of a.companies) companyToAccount.set(c.id, a.id);
  const oppCountByAccount = new Map<string, number>();
  for (const o of opportunityRows) {
    const accId = companyToAccount.get(o.conversation.campaign.companyId);
    if (accId) oppCountByAccount.set(accId, (oppCountByAccount.get(accId) ?? 0) + 1);
  }

  const rows: CustomerListRow[] = accounts.map((a) => {
    const lastScanTimes = a.companies.flatMap((c) => c.campaigns.map((camp) => camp.lastScanAt)).filter((d): d is Date => !!d);
    return {
      id: a.id,
      ownerEmail: a.users[0]?.email ?? null,
      createdAt: a.createdAt,
      plan: a.plan,
      subscriptionStatus: a.subscriptionStatus,
      trialEndsAt: a.trialEndsAt,
      businessCount: a.companies.length,
      businessNames: a.companies.map((c) => c.name),
      opportunityCount: oppCountByAccount.get(a.id) ?? 0,
      lastScanAt: lastScanTimes.length ? new Date(Math.max(...lastScanTimes.map((d) => d.getTime()))) : null,
    };
  });

  return { rows, total, page: safePage, pageSize: PAGE_SIZE };
}

export type CustomerBusinessRow = {
  id: string;
  name: string;
  createdAt: Date;
  hasOffer: boolean;
  campaigns: { id: string; name: string; sourceType: string; status: string; lastScanAt: Date | null; lastScanStatus: string | null }[];
  opportunityCount: number;
};

export type CustomerDetail = {
  id: string; // Account id
  createdAt: Date;
  users: { id: string; email: string; name: string | null; role: string; createdAt: Date }[];
  plan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  businesses: CustomerBusinessRow[];
  totalOpportunityCount: number;
  lastActivityAt: Date | null;
};

export async function getCustomerDetail(accountId: string): Promise<CustomerDetail | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      createdAt: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      users: { select: { id: true, email: true, name: true, role: true, createdAt: true } },
      companies: {
        orderBy: { createdAt: "asc" },
        take: 10, // bounded — no plan currently allows more than 10 businesses
        select: {
          id: true,
          name: true,
          createdAt: true,
          offer: { select: { id: true } },
          campaigns: {
            select: { id: true, name: true, sourceType: true, status: true, lastScanAt: true, lastScanStatus: true },
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      },
    },
  });
  if (!account) return null;

  const companyIds = account.companies.map((c) => c.id);
  const [opportunityRows, lastActivity] = await Promise.all([
    companyIds.length
      ? prisma.opportunity.findMany({
          where: { conversation: { campaign: { companyId: { in: companyIds } } } },
          select: { conversation: { select: { campaign: { select: { companyId: true } } } } },
        })
      : Promise.resolve([]),
    companyIds.length
      ? prisma.activity.findFirst({
          where: { opportunity: { conversation: { campaign: { companyId: { in: companyIds } } } } },
          orderBy: { at: "desc" },
          select: { at: true },
        })
      : Promise.resolve(null),
  ]);

  const oppCountByCompany = new Map<string, number>();
  for (const o of opportunityRows) {
    const id = o.conversation.campaign.companyId;
    oppCountByCompany.set(id, (oppCountByCompany.get(id) ?? 0) + 1);
  }

  const businesses: CustomerBusinessRow[] = account.companies.map((c) => ({
    id: c.id,
    name: c.name,
    createdAt: c.createdAt,
    hasOffer: !!c.offer,
    campaigns: c.campaigns,
    opportunityCount: oppCountByCompany.get(c.id) ?? 0,
  }));

  return {
    id: account.id,
    createdAt: account.createdAt,
    users: account.users,
    plan: account.plan,
    subscriptionStatus: account.subscriptionStatus,
    trialEndsAt: account.trialEndsAt,
    currentPeriodEnd: account.currentPeriodEnd,
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
    stripeCustomerId: account.stripeCustomerId,
    stripeSubscriptionId: account.stripeSubscriptionId,
    businesses,
    totalOpportunityCount: [...oppCountByCompany.values()].reduce((a, b) => a + b, 0),
    lastActivityAt: lastActivity?.at ?? null,
  };
}
