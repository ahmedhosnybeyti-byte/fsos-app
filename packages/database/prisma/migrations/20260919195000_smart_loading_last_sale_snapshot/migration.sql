CREATE TABLE "smart_loading_last_sale_snapshots" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "route_id" TEXT NOT NULL,
  "product_code" TEXT NOT NULL,
  "target_date" TEXT NOT NULL,
  "active_version" TEXT NOT NULL,
  "last_sale_date" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "smart_loading_last_sale_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "smart_loading_last_sale_snapshots_company_id_route_id_product_code_target_date_active_version_key" ON "smart_loading_last_sale_snapshots"("company_id", "route_id", "product_code", "target_date", "active_version");
CREATE INDEX "smart_loading_last_sale_snapshots_company_id_route_id_target_date_active_version_idx" ON "smart_loading_last_sale_snapshots"("company_id", "route_id", "target_date", "active_version");
CREATE TABLE "smart_loading_last_sale_snapshot_routes" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "route_id" TEXT NOT NULL,
  "target_date" TEXT NOT NULL,
  "active_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "smart_loading_last_sale_snapshot_routes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "smart_loading_last_sale_snapshot_routes_company_id_route_id_target_date_active_version_key" ON "smart_loading_last_sale_snapshot_routes"("company_id", "route_id", "target_date", "active_version");
CREATE INDEX "smart_loading_last_sale_snapshot_routes_company_id_target_date_active_version_idx" ON "smart_loading_last_sale_snapshot_routes"("company_id", "target_date", "active_version");
ALTER TABLE "smart_loading_last_sale_snapshots" ADD CONSTRAINT "smart_loading_last_sale_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "smart_loading_last_sale_snapshot_routes" ADD CONSTRAINT "smart_loading_last_sale_snapshot_routes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
