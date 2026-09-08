CREATE TYPE "WorkbookIngestionRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "workbook_ingestion_runs" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "triggered_by_user_id" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "content_hash" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "replace_file_id" TEXT,
  "via_super_admin" BOOLEAN NOT NULL DEFAULT false,
  "can_provision_employee_accounts" BOOLEAN NOT NULL DEFAULT false,
  "status" "WorkbookIngestionRunStatus" NOT NULL DEFAULT 'QUEUED',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "result" JSONB,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workbook_ingestion_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workbook_ingestion_runs_status_created_at_idx" ON "workbook_ingestion_runs"("status", "created_at");
CREATE INDEX "workbook_ingestion_runs_company_id_content_hash_idx" ON "workbook_ingestion_runs"("company_id", "content_hash");
CREATE INDEX "workbook_ingestion_runs_replace_file_id_idx" ON "workbook_ingestion_runs"("replace_file_id");
CREATE UNIQUE INDEX "workbook_ingestion_runs_active_upload_key" ON "workbook_ingestion_runs"("company_id", "content_hash") WHERE "status" IN ('QUEUED', 'RUNNING') AND "replace_file_id" IS NULL;
CREATE UNIQUE INDEX "workbook_ingestion_runs_active_replace_key" ON "workbook_ingestion_runs"("replace_file_id") WHERE "status" IN ('QUEUED', 'RUNNING') AND "replace_file_id" IS NOT NULL;
ALTER TABLE "workbook_ingestion_runs" ADD CONSTRAINT "workbook_ingestion_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workbook_ingestion_runs" ADD CONSTRAINT "workbook_ingestion_runs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workbook_ingestion_runs" ADD CONSTRAINT "workbook_ingestion_runs_replace_file_id_fkey" FOREIGN KEY ("replace_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
