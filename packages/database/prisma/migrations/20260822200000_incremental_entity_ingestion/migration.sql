CREATE TABLE "rie_canonical_entity_rows" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "source_file_id" TEXT,
    "entity_name" TEXT NOT NULL,
    "entity_key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rie_canonical_entity_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rie_canonical_entity_rows_company_id_entity_name_entity_key_key"
ON "rie_canonical_entity_rows"("company_id", "entity_name", "entity_key");

CREATE INDEX "rie_canonical_entity_rows_company_id_entity_name_idx"
ON "rie_canonical_entity_rows"("company_id", "entity_name");

ALTER TABLE "rie_canonical_entity_rows"
ADD CONSTRAINT "rie_canonical_entity_rows_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rie_canonical_entity_rows"
ADD CONSTRAINT "rie_canonical_entity_rows_source_file_id_fkey"
FOREIGN KEY ("source_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
