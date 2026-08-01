CREATE TYPE "LostOpportunityExclusionScope" AS ENUM ('CUSTOMER_PRODUCT', 'SALESPERSON_PRODUCT', 'TEAM_PRODUCT', 'COMPANY_PRODUCT');

CREATE TABLE "lost_opportunity_exclusions" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "scope_type" "LostOpportunityExclusionScope" NOT NULL,
  "scope_key" TEXT NOT NULL,
  "customer_code" TEXT,
  "product_code" TEXT NOT NULL,
  "salesperson_id" TEXT,
  "team_scope_id" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "revoked_by_user_id" TEXT,
  CONSTRAINT "lost_opportunity_exclusions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lost_opportunity_exclusions_company_id_scope_type_scope_key_key" UNIQUE ("company_id", "scope_type", "scope_key"),
  CONSTRAINT "lost_opportunity_exclusions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lost_opportunity_exclusions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lost_opportunity_exclusions_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "lost_opportunity_exclusions_company_id_product_code_revoked_at_idx" ON "lost_opportunity_exclusions"("company_id", "product_code", "revoked_at");
CREATE INDEX "lost_opportunity_exclusions_company_id_salesperson_id_product_code_revoked_at_idx" ON "lost_opportunity_exclusions"("company_id", "salesperson_id", "product_code", "revoked_at");
CREATE INDEX "lost_opportunity_exclusions_company_id_team_scope_id_product_code_revoked_at_idx" ON "lost_opportunity_exclusions"("company_id", "team_scope_id", "product_code", "revoked_at");
CREATE INDEX "lost_opportunity_exclusions_company_id_customer_code_product_code_revoked_at_idx" ON "lost_opportunity_exclusions"("company_id", "customer_code", "product_code", "revoked_at");
