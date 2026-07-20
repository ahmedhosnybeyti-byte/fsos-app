-- Duplicate-upload guard (2026-07-19) — see schema.prisma's
-- File.contentHash doc comment. Nullable (old rows simply have no hash),
-- so no backfill needed.
ALTER TABLE "files" ADD COLUMN "content_hash" TEXT;

-- CreateIndex
CREATE INDEX "files_company_id_content_hash_idx" ON "files"("company_id", "content_hash");
