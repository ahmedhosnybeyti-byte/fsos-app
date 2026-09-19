CREATE TABLE "smart_loading_management_loading_risk_snapshots" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "target_date" TEXT NOT NULL,
  "sales_from" TEXT NOT NULL,
  "sales_to" TEXT NOT NULL,
  "person_level" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "scope_is_company_wide" BOOLEAN NOT NULL DEFAULT false,
  "route_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "smart_loading_management_loading_risk_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "smart_loading_management_loading_risk_snapshots_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "smart_loading_management_loading_risk_snapshots_company_id_target_date_sales_from_sales_to_person_level_scope_key_key"
  ON "smart_loading_management_loading_risk_snapshots"("company_id", "target_date", "sales_from", "sales_to", "person_level", "scope_key");
CREATE INDEX "smart_loading_risk_snapshots_company_scope_idx"
  ON "smart_loading_management_loading_risk_snapshots"("company_id", "scope_is_company_wide");
CREATE INDEX "smart_loading_risk_snapshots_route_ids_idx"
  ON "smart_loading_management_loading_risk_snapshots" USING GIN ("route_ids");
