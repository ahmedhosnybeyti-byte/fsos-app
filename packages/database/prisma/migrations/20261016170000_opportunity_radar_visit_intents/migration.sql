ALTER TABLE "company_opportunities"
    ADD COLUMN "assigned_by_user_id" TEXT,
    ADD COLUMN "assigned_at" TIMESTAMP(3),
    ADD COLUMN "order_value" DECIMAL(18,2),
    ADD COLUMN "order_quantity" DECIMAL(18,3);

ALTER TABLE "company_opportunities"
    ADD CONSTRAINT "company_opportunities_assigned_by_user_id_fkey"
    FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prospect_visit_intents"
    ALTER COLUMN "prospect_id" DROP NOT NULL,
    ADD COLUMN "company_opportunity_id" TEXT,
    ADD COLUMN "completed_at" TIMESTAMP(3);

ALTER TABLE "prospect_visit_intents"
    ADD CONSTRAINT "prospect_visit_intents_company_opportunity_id_fkey"
    FOREIGN KEY ("company_opportunity_id") REFERENCES "company_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prospect_visit_intents"
    ADD CONSTRAINT "prospect_visit_intents_exactly_one_source_check"
    CHECK (("prospect_id" IS NOT NULL) <> ("company_opportunity_id" IS NOT NULL));

CREATE UNIQUE INDEX "prospect_visit_intents_company_opportunity_id_key"
    ON "prospect_visit_intents"("company_opportunity_id");
