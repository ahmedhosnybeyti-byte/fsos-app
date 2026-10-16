CREATE TYPE "MarketOpportunityType" AS ENUM ('PURCHASE', 'EVENT', 'PROACTIVE');
CREATE TYPE "MarketOpportunityStatus" AS ENUM ('OPEN', 'CLOSED', 'EXPIRED');
CREATE TYPE "OpportunityConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "CompanyOpportunityStatus" AS ENUM ('NEW', 'REVIEWED', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST', 'EXPIRED');

CREATE TABLE "market_opportunities" (
    "id" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "opportunity_type" "MarketOpportunityType" NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "why_relevant" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT,
    "location" TEXT,
    "published_at" TIMESTAMP(3),
    "opportunity_date" TIMESTAMP(3),
    "deadline_at" TIMESTAMP(3),
    "status" "MarketOpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "confidence" "OpportunityConfidence" NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "contact_url" TEXT,
    "source_url" TEXT NOT NULL,
    "secondary_source_url" TEXT,
    "source_name" TEXT NOT NULL,
    "last_verified_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "market_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_opportunities" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "market_opportunity_id" TEXT NOT NULL,
    "status" "CompanyOpportunityStatus" NOT NULL DEFAULT 'NEW',
    "assigned_to_user_id" TEXT,
    "contacted_at" TIMESTAMP(3),
    "notes" TEXT,
    "outcome" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_opportunities_source_url_title_key" ON "market_opportunities"("source_url", "title");
CREATE INDEX "market_opportunities_filter_idx" ON "market_opportunities"("vertical", "opportunity_type", "status", "deadline_at");
CREATE INDEX "market_opportunities_status_date_idx" ON "market_opportunities"("status", "opportunity_date");
CREATE UNIQUE INDEX "company_opportunities_company_id_market_opportunity_id_key" ON "company_opportunities"("company_id", "market_opportunity_id");
CREATE INDEX "company_opportunities_status_idx" ON "company_opportunities"("company_id", "status", "updated_at");
CREATE INDEX "company_opportunities_assignee_idx" ON "company_opportunities"("company_id", "assigned_to_user_id", "status");

ALTER TABLE "company_opportunities" ADD CONSTRAINT "company_opportunities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_opportunities" ADD CONSTRAINT "company_opportunities_market_opportunity_id_fkey" FOREIGN KEY ("market_opportunity_id") REFERENCES "market_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_opportunities" ADD CONSTRAINT "company_opportunities_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
