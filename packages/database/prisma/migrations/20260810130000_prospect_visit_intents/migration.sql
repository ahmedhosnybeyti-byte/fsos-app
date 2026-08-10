CREATE TYPE "ProspectVisitIntentStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "prospect_visit_intents" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "prospect_id" TEXT NOT NULL,
  "assigned_to_user_id" TEXT NOT NULL,
  "scheduled_for" DATE NOT NULL,
  "status" "ProspectVisitIntentStatus" NOT NULL DEFAULT 'PLANNED',
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prospect_visit_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prospect_visit_intents_prospect_id_assigned_to_user_id_scheduled_for_key" ON "prospect_visit_intents"("prospect_id", "assigned_to_user_id", "scheduled_for");
CREATE INDEX "prospect_visit_intents_company_id_assigned_to_user_id_scheduled_for_idx" ON "prospect_visit_intents"("company_id", "assigned_to_user_id", "scheduled_for");
CREATE INDEX "prospect_visit_intents_company_id_scheduled_for_status_idx" ON "prospect_visit_intents"("company_id", "scheduled_for", "status");

ALTER TABLE "prospect_visit_intents" ADD CONSTRAINT "prospect_visit_intents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospect_visit_intents" ADD CONSTRAINT "prospect_visit_intents_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospect_visit_intents" ADD CONSTRAINT "prospect_visit_intents_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prospect_visit_intents" ADD CONSTRAINT "prospect_visit_intents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
