-- CreateEnum
CREATE TYPE "TargetSource" AS ENUM ('UPLOAD', 'MANUAL');

-- CreateTable
-- Sales Growth Intelligence (SGI) Phase 1's Goal Planning source of truth:
-- one target per rep/territory per month, whether it came from an
-- uploaded "Targets" file (source=UPLOAD, source_file_id set) or was
-- entered directly in the platform's target-list UI (source=MANUAL,
-- created_by_user_id set). Additive — no existing table is touched. See
-- docs/SGI_ROADMAP.md section 3 point 1 for the reasoning.
CREATE TABLE "targets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "rep_or_territory_key" TEXT NOT NULL,
    "period_month" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "source" "TargetSource" NOT NULL DEFAULT 'MANUAL',
    "created_by_user_id" TEXT,
    "source_file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One target per rep/territory per month — re-processing an uploaded
-- Targets file for the same month upserts this row instead of
-- accumulating duplicates.
CREATE UNIQUE INDEX "targets_company_id_rep_or_territory_key_period_month_key" ON "targets"("company_id", "rep_or_territory_key", "period_month");

-- CreateIndex
CREATE INDEX "targets_company_id_period_month_idx" ON "targets"("company_id", "period_month");

-- AddForeignKey
ALTER TABLE "targets" ADD CONSTRAINT "targets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "targets" ADD CONSTRAINT "targets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "targets" ADD CONSTRAINT "targets_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
