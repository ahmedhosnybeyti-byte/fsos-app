-- Redesign: files.file_type (closed FileType enum) -> files.dataset_type
-- (free-form text). A new dataset category should never require a schema
-- migration again. Existing rows keep their value as plain text (e.g.
-- 'COMPANY' stays 'COMPANY') — no data loss.

ALTER TABLE "files" RENAME COLUMN "file_type" TO "dataset_type";
ALTER TABLE "files" ALTER COLUMN "dataset_type" TYPE TEXT;
DROP TYPE "FileType";

CREATE INDEX "files_company_id_dataset_type_idx" ON "files"("company_id", "dataset_type");
