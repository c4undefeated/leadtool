-- Multi-business support: introduce Account above Company (Business).
-- Every existing Company becomes an Account's first/default business,
-- correlated deterministically (Account.id = 'acct_' || Company.id) so no
-- RETURNING-order dependency is needed to link the two.

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "plan" TEXT,
    "subscriptionStatus" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_stripeCustomerId_key" ON "Account"("stripeCustomerId");
CREATE UNIQUE INDEX "Account_stripeSubscriptionId_key" ON "Account"("stripeSubscriptionId");

-- Backfill: one Account per existing Company, carrying over its billing fields.
INSERT INTO "Account" (id, "createdAt", "stripeCustomerId", "stripeSubscriptionId", "stripePriceId", "plan", "subscriptionStatus", "trialEndsAt", "currentPeriodEnd", "cancelAtPeriodEnd")
SELECT 'acct_' || "id", "createdAt", "stripeCustomerId", "stripeSubscriptionId", "stripePriceId", "plan", "subscriptionStatus", "trialEndsAt", "currentPeriodEnd", "cancelAtPeriodEnd"
FROM "Company";

-- AlterTable: Company gains accountId, loses the (now Account-owned) billing columns.
ALTER TABLE "Company" ADD COLUMN "accountId" TEXT;
UPDATE "Company" SET "accountId" = 'acct_' || "id";
ALTER TABLE "Company" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "Company" ADD CONSTRAINT "Company_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Company" DROP COLUMN "stripeCustomerId";
ALTER TABLE "Company" DROP COLUMN "stripeSubscriptionId";
ALTER TABLE "Company" DROP COLUMN "stripePriceId";
ALTER TABLE "Company" DROP COLUMN "plan";
ALTER TABLE "Company" DROP COLUMN "subscriptionStatus";
ALTER TABLE "Company" DROP COLUMN "trialEndsAt";
ALTER TABLE "Company" DROP COLUMN "currentPeriodEnd";
ALTER TABLE "Company" DROP COLUMN "cancelAtPeriodEnd";

-- AlterTable: User gains accountId (nullable — defensive, though every
-- existing signup path already guarantees a company, and every existing
-- company now has an account).
ALTER TABLE "User" ADD COLUMN "accountId" TEXT;
UPDATE "User" SET "accountId" = 'acct_' || "companyId" WHERE "companyId" IS NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
