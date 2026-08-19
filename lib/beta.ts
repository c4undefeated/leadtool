import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * IntentScout Beta Mode / Controlled Manual Scanning.
 *
 * A single admin-controlled database row (BetaSettings, fixed id
 * "singleton") gates two things:
 *   - lib/dailyScan.ts's runDailyScan(): skips all scanning while enabled.
 *   - lib/actions/conversations.ts's runScanAction(): the manual "Run
 *     scan" button is only usable while enabled, and only up to
 *     manualScansPerUserPerDay times per user per day.
 *
 * Deliberately a DB row, not an env var — flipping it takes effect
 * immediately for every request, no redeploy (spec section 15).
 */

export const BETA_SETTINGS_ID = "singleton";

export type BetaSettings = {
  enabled: boolean;
  manualScansPerUserPerDay: number;
  scanningPaused: boolean;
  updatedAt: Date;
  updatedByEmail: string | null;
};

/** The migration that creates BetaSettings also seeds this one row — always present, never lazily created. */
export async function getBetaSettings(): Promise<BetaSettings> {
  return prisma.betaSettings.findUniqueOrThrow({ where: { id: BETA_SETTINGS_ID } });
}

/** UTC-midnight-truncated calendar day — the app has no other established timezone convention (spec section 4). */
export function utcDayStart(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export type BetaClaimResult = { allowed: boolean; used: number; limit: number };

/**
 * Atomically claims one of the user's manual-scan allowance for today, or
 * fails without side effects if they're already at the limit. A single
 * conditional write — INSERT ... ON CONFLICT (userId, day) DO UPDATE ...
 * WHERE count < limit — so two concurrent requests (double-click, two
 * tabs, two direct calls to the server action) can never both succeed past
 * the limit: Postgres serializes the two statements, and only the one that
 * still sees count < limit at the time it runs gets to increment. This is
 * the same "one atomic conditional write, no read-then-write window"
 * pattern lib/dailyScan.ts's claimCampaignForScan already uses for
 * campaign locking — spec section 5 explicitly calls out the naive
 * read-check-increment sequence as unsafe, and it is, for exactly this
 * reason.
 */
export async function claimBetaScanAllowance(userId: string, limit: number): Promise<BetaClaimResult> {
  const day = utcDayStart();
  const id = randomUUID();
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "BetaScanUsage" (id, "userId", day, count, "createdAt", "updatedAt")
    VALUES (${id}, ${userId}, ${day}, 1, now(), now())
    ON CONFLICT ("userId", day)
    DO UPDATE SET count = "BetaScanUsage".count + 1, "updatedAt" = now()
    WHERE "BetaScanUsage".count < ${limit}
    RETURNING count
  `;
  const claimed = rows[0];
  if (!claimed) {
    const existing = await prisma.betaScanUsage.findUnique({ where: { userId_day: { userId, day } } });
    return { allowed: false, used: existing?.count ?? limit, limit };
  }
  return { allowed: true, used: claimed.count, limit };
}

/**
 * Refunds one claimed allowance — used only when a claimed scan never
 * actually started (spec section 14: "Do not permanently consume the
 * user's scan allowance if the scan never actually started"). Atomic and
 * floor-guarded at 0, so an out-of-order refund can never push the count
 * negative and grant extra allowance.
 */
export async function refundBetaScanAllowance(userId: string): Promise<void> {
  const day = utcDayStart();
  await prisma.$executeRaw`
    UPDATE "BetaScanUsage" SET count = count - 1, "updatedAt" = now()
    WHERE "userId" = ${userId} AND day = ${day} AND count > 0
  `;
}

export type BetaUsage = { used: number; remaining: number; limit: number };

/** Read-only lookup for UI display — never used to enforce the limit itself (claimBetaScanAllowance is the only enforcement path). */
export async function getBetaUsageForUser(userId: string, limit: number): Promise<BetaUsage> {
  const day = utcDayStart();
  const row = await prisma.betaScanUsage.findUnique({ where: { userId_day: { userId, day } } });
  const used = row?.count ?? 0;
  return { used, remaining: Math.max(0, limit - used), limit };
}

/** Admin-only: deletes today's usage rows so every user's count resets to 0 immediately. Caller must have already verified admin auth. */
export async function resetTodaysBetaCounters(): Promise<number> {
  const day = utcDayStart();
  const result = await prisma.betaScanUsage.deleteMany({ where: { day } });
  return result.count;
}
