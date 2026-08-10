CREATE TYPE "ProspectMarketSegment" AS ENUM ('RETAIL_FMCG', 'HORECA');

ALTER TABLE "prospects"
  ADD COLUMN "market_segment" "ProspectMarketSegment",
  ADD COLUMN "business_type" TEXT,
  ADD COLUMN "size_band" TEXT,
  ADD COLUMN "score_version" TEXT,
  ADD COLUMN "score_total" DOUBLE PRECISION,
  ADD COLUMN "score_confidence" DOUBLE PRECISION,
  ADD COLUMN "business_type_size_score" DOUBLE PRECISION,
  ADD COLUMN "commercial_density_score" DOUBLE PRECISION,
  ADD COLUMN "activity_signal_score" DOUBLE PRECISION,
  ADD COLUMN "vision_score" DOUBLE PRECISION,
  ADD COLUMN "scored_at" TIMESTAMP(3);

CREATE TABLE "murshidak_intelligence_profiles" (
  "id" TEXT NOT NULL,
  "prospect_id" TEXT NOT NULL,
  "business_classification" JSONB,
  "menu_service_insights" JSONB,
  "likely_needs_categories" JSONB,
  "product_fit_insights" JSONB,
  "analysis_version" TEXT,
  "input_fingerprint" TEXT,
  "analyzed_at" TIMESTAMP(3),
  "refresh_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "murshidak_intelligence_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "murshidak_intelligence_profiles_prospect_id_key" ON "murshidak_intelligence_profiles"("prospect_id");
CREATE INDEX "murshidak_intelligence_profiles_refresh_at_idx" ON "murshidak_intelligence_profiles"("refresh_at");
CREATE INDEX "prospects_company_id_market_segment_score_total_idx" ON "prospects"("company_id", "market_segment", "score_total");

ALTER TABLE "murshidak_intelligence_profiles"
  ADD CONSTRAINT "murshidak_intelligence_profiles_prospect_id_fkey"
  FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
