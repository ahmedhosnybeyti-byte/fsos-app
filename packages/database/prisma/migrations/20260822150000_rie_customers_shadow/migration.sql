CREATE TABLE "rie_dataset_versions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "source_file_id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'MATERIALIZING',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "materialized_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rie_dataset_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rie_entity_rows" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "dataset_version_id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "entity_key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rie_entity_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rie_dataset_versions_source_file_id_entity_name_key" ON "rie_dataset_versions"("source_file_id", "entity_name");
CREATE INDEX "rie_dataset_versions_company_id_entity_name_is_active_idx" ON "rie_dataset_versions"("company_id", "entity_name", "is_active");
CREATE UNIQUE INDEX "rie_entity_rows_dataset_version_id_entity_key_key" ON "rie_entity_rows"("dataset_version_id", "entity_key");
CREATE INDEX "rie_entity_rows_company_id_entity_name_entity_key_idx" ON "rie_entity_rows"("company_id", "entity_name", "entity_key");

ALTER TABLE "rie_dataset_versions" ADD CONSTRAINT "rie_dataset_versions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rie_dataset_versions" ADD CONSTRAINT "rie_dataset_versions_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rie_entity_rows" ADD CONSTRAINT "rie_entity_rows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rie_entity_rows" ADD CONSTRAINT "rie_entity_rows_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "rie_dataset_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
