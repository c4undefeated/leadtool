-- AlterTable
ALTER TABLE "Company" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Company" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Company" ADD COLUMN "stripePriceId" TEXT;
ALTER TABLE "Company" ADD COLUMN "plan" TEXT;
ALTER TABLE "Company" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "Company" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Company_stripeCustomerId_key" ON "Company"("stripeCustomerId");
CREATE UNIQUE INDEX "Company_stripeSubscriptionId_key" ON "Company"("stripeSubscriptionId");

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);
