import { prisma } from "@/lib/prisma";

export type BusinessSummary = { id: string; name: string };

/** Every business (Company) the account owns — used by the Business Switcher. Bounded implicitly by maxBusinesses (never more than 10 rows in practice). */
export async function listBusinessesForAccount(accountId: string): Promise<BusinessSummary[]> {
  return prisma.company.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}
