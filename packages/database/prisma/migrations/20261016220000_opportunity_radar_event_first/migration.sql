CREATE TYPE "OpportunityReviewStatus" AS ENUM ('VERIFIED', 'NEEDS_VERIFICATION', 'HOLD_POSTPONED', 'HOLD_RECHECK');
CREATE TYPE "OpportunityLocationKind" AS ENUM ('PRECISE', 'SEARCH_ONLY', 'MULTI_VENUE', 'UNKNOWN');
CREATE TYPE "OpportunityRadarMode" AS ENUM ('STANDARD', 'EVENT_FIRST_WATER');

ALTER TABLE "market_opportunities"
    ADD COLUMN "external_key" TEXT,
    ADD COLUMN "event_category" TEXT,
    ADD COLUMN "venue_name" TEXT,
    ADD COLUMN "venue_address" TEXT,
    ADD COLUMN "location_kind" "OpportunityLocationKind",
    ADD COLUMN "map_url" TEXT,
    ADD COLUMN "map_link_kind" TEXT,
    ADD COLUMN "event_end_at" TIMESTAMP(3),
    ADD COLUMN "date_label" TEXT,
    ADD COLUMN "contracting_deadline_at" TIMESTAMP(3),
    ADD COLUMN "priority_rank" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "review_status" "OpportunityReviewStatus" NOT NULL DEFAULT 'VERIFIED',
    ADD COLUMN "review_note" TEXT,
    ADD COLUMN "water_demand_status" TEXT,
    ADD COLUMN "contact_role" TEXT,
    ADD COLUMN "next_action" TEXT,
    ADD COLUMN "source_metadata" JSONB;

DROP INDEX "market_opportunities_source_url_title_key";

CREATE UNIQUE INDEX "market_opportunities_external_key_key"
    ON "market_opportunities"("external_key");

CREATE UNIQUE INDEX "market_opportunities_source_url_title_opportunity_date_key"
    ON "market_opportunities"("source_url", "title", "opportunity_date");

CREATE INDEX "market_opportunities_event_first_idx"
    ON "market_opportunities"("vertical", "review_status", "opportunity_type", "status", "priority_rank", "opportunity_date");

CREATE TABLE "market_opportunity_revisions" (
    "id" TEXT NOT NULL,
    "market_opportunity_id" TEXT NOT NULL,
    "change_type" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "verification_url" TEXT,
    "verified_at" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "market_opportunity_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "market_opportunity_revisions_history_idx"
    ON "market_opportunity_revisions"("market_opportunity_id", "created_at");

ALTER TABLE "market_opportunity_revisions"
    ADD CONSTRAINT "market_opportunity_revisions_market_opportunity_id_fkey"
    FOREIGN KEY ("market_opportunity_id") REFERENCES "market_opportunities"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "opportunity_radar_policies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "mode" "OpportunityRadarMode" NOT NULL DEFAULT 'STANDARD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "opportunity_radar_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "opportunity_radar_policies_company_id_key"
    ON "opportunity_radar_policies"("company_id");

ALTER TABLE "opportunity_radar_policies"
    ADD CONSTRAINT "opportunity_radar_policies_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
