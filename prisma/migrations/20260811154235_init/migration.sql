-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "companyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "verticalTemplateKey" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "whatYouSell" TEXT NOT NULL,
    "problemsSolved" TEXT NOT NULL,
    "idealCustomer" TEXT NOT NULL,
    "priceRangeMin" INTEGER,
    "priceRangeMax" INTEGER,
    "geography" TEXT,
    "excludedAudiences" TEXT,
    "brandVoice" TEXT,
    "engagementStyle" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Offer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sourceType" TEXT NOT NULL,
    "exclusions" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'keyword',
    CONSTRAINT "Keyword_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "authorRef" TEXT,
    "title" TEXT,
    "originalText" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "community" TEXT,
    "postedAt" DATETIME NOT NULL,
    "ingestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,
    CONSTRAINT "Conversation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "intentScore" INTEGER NOT NULL,
    "fitScore" INTEGER NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "safetyLabel" TEXT NOT NULL,
    "safetyReason" TEXT NOT NULL,
    "detectedNeed" TEXT NOT NULL,
    "whyNow" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "priorityTier" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "analyzedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'new',
    "estimatedValue" INTEGER,
    "outcome" TEXT,
    CONSTRAINT "Opportunity_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngagementRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "strategyReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngagementRecommendation_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommentDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementRecommendationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "whyThisResponse" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentDraft_engagementRecommendationId_fkey" FOREIGN KEY ("engagementRecommendationId") REFERENCES "EngagementRecommendation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DMDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementRecommendationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "whyThisResponse" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DMDraft_engagementRecommendationId_fkey" FOREIGN KEY ("engagementRecommendationId") REFERENCES "EngagementRecommendation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "note" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_companyId_key" ON "Offer"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_source_sourceId_key" ON "Conversation"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_conversationId_key" ON "Opportunity"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentDraft_engagementRecommendationId_key" ON "CommentDraft"("engagementRecommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "DMDraft_engagementRecommendationId_key" ON "DMDraft"("engagementRecommendationId");
