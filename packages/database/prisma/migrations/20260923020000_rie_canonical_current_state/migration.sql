-- RIE canonical current-state projection.
--
-- The version tables remain the immutable ingestion history/reference.  This
-- table contains only the rows selected by the established newest-upload-wins
-- rule, and is refreshed transactionally whenever a source file or dataset
-- version changes lifecycle state.  Runtime RIE queries read this table only.

DROP INDEX "rie_canonical_entity_rows_company_id_entity_name_entity_key_key";

ALTER TABLE "rie_canonical_entity_rows"
ADD COLUMN "precedence" BIGINT NOT NULL DEFAULT 1;

CREATE INDEX "rie_canonical_entity_rows_company_id_entity_name_entity_key_idx"
ON "rie_canonical_entity_rows"("company_id", "entity_name", "entity_key");

CREATE INDEX "rie_canonical_entity_rows_invoice_route_invoice_no_idx"
ON "rie_canonical_entity_rows" (
  "company_id",
  "entity_name",
  (LOWER(BTRIM(COALESCE("data" ->> 'RouteID', '')))),
  (BTRIM(COALESCE("data" ->> 'InvoiceNo', '')))
)
WHERE "entity_name" IN ('Invoices', 'Invoice Items');

CREATE INDEX "rie_canonical_entity_rows_invoice_items_product_invoice_idx"
ON "rie_canonical_entity_rows" (
  "company_id",
  (LOWER(BTRIM(COALESCE("data" ->> 'ProductCode', '')))),
  (LOWER(BTRIM(COALESCE("data" ->> 'InvoiceNo', ''))))
)
WHERE "entity_name" = 'Invoice Items';

CREATE INDEX "rie_canonical_entity_rows_invoice_items_invoice_no_idx"
ON "rie_canonical_entity_rows" (
  "company_id",
  (LOWER(BTRIM(COALESCE("data" ->> 'InvoiceNo', ''))))
)
WHERE "entity_name" = 'Invoice Items';

CREATE OR REPLACE FUNCTION "rie_canonical_business_key"("entity_name" TEXT, "row_data" JSONB)
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE "entity_name"
    WHEN 'Sales Calendar' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'CalendarDate', '')))]
    WHEN 'Prospects' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'ProspectCode', '')))]
    WHEN 'Regions' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'RegionID', '')))]
    WHEN 'Branches' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'BranchID', '')))]
    WHEN 'Employees' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'EmployeeID', '')))]
    WHEN 'Routes' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'RouteID', '')))]
    WHEN 'Route Assignments' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'AssignmentID', '')))]
    WHEN 'Products' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'ProductCode', '')))]
    WHEN 'Price List' THEN ARRAY[
      LOWER(BTRIM(COALESCE("row_data" ->> 'PriceListCode', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'ProductCode', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'Unit', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'StartDate', '')))
    ]
    WHEN 'Customers' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'CustomerCode', '')))]
    WHEN 'Invoices' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'InvoiceNo', '')))]
    WHEN 'Invoice Items' THEN ARRAY[
      LOWER(BTRIM(COALESCE("row_data" ->> 'InvoiceNo', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'LineNo', '')))
    ]
    WHEN 'Visits' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'VisitID', '')))]
    WHEN 'Van Loads' THEN ARRAY[
      LOWER(BTRIM(COALESCE("row_data" ->> 'LoadNo', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'ProductCode', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'Unit', '')))
    ]
    WHEN 'Van Inventory' THEN ARRAY[
      LOWER(BTRIM(COALESCE("row_data" ->> 'ReportDate', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'RouteID', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'ProductCode', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'Unit', '')))
    ]
    WHEN 'Collections' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'CollectionNo', '')))]
    WHEN 'Returns' THEN ARRAY[LOWER(BTRIM(COALESCE("row_data" ->> 'ReturnNo', '')))]
    WHEN 'Return Items' THEN ARRAY[
      LOWER(BTRIM(COALESCE("row_data" ->> 'ReturnNo', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'LineNo', '')))
    ]
    WHEN 'Targets' THEN ARRAY[
      LOWER(BTRIM(COALESCE("row_data" ->> 'Month', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'Year', ''))),
      LOWER(BTRIM(COALESCE("row_data" ->> 'RouteID', '')))
    ]
    -- Unknown legacy entities have no approved business key. Treat them as
    -- blank-key rows, matching the old path's lossless behavior.
    ELSE ARRAY['']
  END
$$;

CREATE OR REPLACE FUNCTION "rie_refresh_canonical_current_state"("target_company_id" TEXT, "target_entity_name" TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Concurrent uploads/deactivations for the same company/entity must publish
  -- in commit order. Transaction-scoped advisory locking serializes only that
  -- projection; unrelated companies/entities remain independent.
  PERFORM pg_advisory_xact_lock(hashtextextended("target_company_id" || CHR(31) || "target_entity_name", 0));

  CREATE TEMP TABLE IF NOT EXISTS "rie_selected_current_rows" (
    id TEXT PRIMARY KEY,
    "company_id" TEXT NOT NULL,
    "source_file_id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "entity_key" TEXT NOT NULL,
    precedence BIGINT NOT NULL,
    data JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE TABLE "rie_selected_current_rows";

  WITH "eligible_versions" AS MATERIALIZED (
    SELECT version.id,
      version."source_file_id",
      ROW_NUMBER() OVER (ORDER BY source_file."created_at" DESC, source_file.id DESC) AS precedence
    FROM "rie_dataset_versions" version
    INNER JOIN "files" source_file ON source_file.id = version."source_file_id"
    WHERE version."company_id" = "target_company_id"
      AND version."entity_name" = "target_entity_name"
      AND version."is_active" = TRUE
      AND source_file."company_id" = "target_company_id"
      AND source_file."is_active" = TRUE
      AND source_file.status = 'READY'
      AND source_file."dataset_type_confirmed" = TRUE
  ), "ranked_rows" AS MATERIALIZED (
    SELECT source_row.id,
      source_row."company_id",
      eligible."source_file_id",
      source_row."entity_name",
      source_row."entity_key",
      source_row.data,
      source_row."created_at",
      "rie_canonical_business_key"(source_row."entity_name", source_row.data) AS business_key,
      eligible.precedence,
      MIN(eligible.precedence) OVER (
        PARTITION BY "rie_canonical_business_key"(source_row."entity_name", source_row.data)
      ) AS newest_precedence
    FROM "eligible_versions" eligible
    INNER JOIN "rie_entity_rows" source_row ON source_row."dataset_version_id" = eligible.id
    WHERE source_row."company_id" = "target_company_id"
      AND source_row."entity_name" = "target_entity_name"
  )
  INSERT INTO "rie_selected_current_rows"
    (id, "company_id", "source_file_id", "entity_name", "entity_key", precedence, data, "created_at")
    SELECT id, "company_id", "source_file_id", "entity_name", "entity_key", precedence, data, "created_at"
    FROM "ranked_rows"
    WHERE ARRAY_POSITION(business_key, '') IS NOT NULL
      OR precedence = newest_precedence;

  INSERT INTO "rie_canonical_entity_rows"
    (id, "company_id", "source_file_id", "entity_name", "entity_key", precedence, data, "created_at", "updated_at")
  SELECT id, "company_id", "source_file_id", "entity_name", "entity_key", precedence, data, "created_at", CURRENT_TIMESTAMP
  FROM "rie_selected_current_rows"
  ON CONFLICT (id) DO UPDATE SET
    "company_id" = EXCLUDED."company_id",
    "source_file_id" = EXCLUDED."source_file_id",
    "entity_name" = EXCLUDED."entity_name",
    "entity_key" = EXCLUDED."entity_key",
    precedence = EXCLUDED.precedence,
    data = EXCLUDED.data,
    "created_at" = EXCLUDED."created_at",
    "updated_at" = CASE
      WHEN "rie_canonical_entity_rows"."company_id" IS DISTINCT FROM EXCLUDED."company_id"
        OR "rie_canonical_entity_rows"."source_file_id" IS DISTINCT FROM EXCLUDED."source_file_id"
        OR "rie_canonical_entity_rows"."entity_name" IS DISTINCT FROM EXCLUDED."entity_name"
        OR "rie_canonical_entity_rows"."entity_key" IS DISTINCT FROM EXCLUDED."entity_key"
        OR "rie_canonical_entity_rows".data IS DISTINCT FROM EXCLUDED.data
      THEN CURRENT_TIMESTAMP
      ELSE "rie_canonical_entity_rows"."updated_at"
    END;

  DELETE FROM "rie_canonical_entity_rows" current_row
  WHERE current_row."company_id" = "target_company_id"
    AND current_row."entity_name" = "target_entity_name"
    AND NOT EXISTS (
      SELECT 1
      FROM "rie_selected_current_rows" selected_row
      WHERE selected_row.id = current_row.id
    );
END
$$;

CREATE OR REPLACE FUNCTION "rie_refresh_current_state_for_file_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE affected RECORD;
BEGIN
  IF OLD."is_active" IS NOT DISTINCT FROM NEW."is_active"
    AND OLD.status IS NOT DISTINCT FROM NEW.status
    AND OLD."dataset_type_confirmed" IS NOT DISTINCT FROM NEW."dataset_type_confirmed"
    AND OLD."company_id" IS NOT DISTINCT FROM NEW."company_id"
  THEN
    RETURN NEW;
  END IF;

  FOR affected IN
    SELECT DISTINCT version."company_id", version."entity_name"
    FROM "rie_dataset_versions" version
    WHERE version."source_file_id" = NEW.id
  LOOP
    PERFORM "rie_refresh_canonical_current_state"(affected."company_id", affected."entity_name");
  END LOOP;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "rie_refresh_current_state_for_version_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "rie_refresh_canonical_current_state"(OLD."company_id", OLD."entity_name");
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' AND NEW."is_active" = FALSE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (OLD."company_id", OLD."entity_name", OLD."source_file_id", OLD."is_active")
      IS NOT DISTINCT FROM
      (NEW."company_id", NEW."entity_name", NEW."source_file_id", NEW."is_active")
  THEN
    RETURN NEW;
  END IF;

  -- Normal ingestion activates the version while its file is PROCESSING.
  -- Defer the only expensive refresh until the file's atomic READY update.
  IF NOT EXISTS (
    SELECT 1
    FROM "files" source_file
    WHERE source_file.id IN (NEW."source_file_id", CASE WHEN TG_OP = 'UPDATE' THEN OLD."source_file_id" ELSE NEW."source_file_id" END)
      AND source_file."is_active" = TRUE
      AND source_file.status = 'READY'
      AND source_file."dataset_type_confirmed" = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (OLD."company_id", OLD."entity_name") IS DISTINCT FROM (NEW."company_id", NEW."entity_name")
  THEN
    PERFORM "rie_refresh_canonical_current_state"(OLD."company_id", OLD."entity_name");
  END IF;
  PERFORM "rie_refresh_canonical_current_state"(NEW."company_id", NEW."entity_name");
  RETURN NEW;
END
$$;

CREATE TRIGGER "rie_current_state_file_lifecycle"
AFTER UPDATE ON "files"
FOR EACH ROW
EXECUTE FUNCTION "rie_refresh_current_state_for_file_change"();

CREATE TRIGGER "rie_current_state_version_lifecycle"
AFTER INSERT OR UPDATE OR DELETE ON "rie_dataset_versions"
FOR EACH ROW
EXECUTE FUNCTION "rie_refresh_current_state_for_version_change"();

-- One-time cutover: rebuild every entity that has version history. Entities
-- without version history keep their existing canonical rows until their next
-- validated upload creates the first version.
DO $$
DECLARE affected RECORD;
BEGIN
  FOR affected IN
    SELECT DISTINCT version."company_id", version."entity_name"
    FROM "rie_dataset_versions" version
  LOOP
    PERFORM "rie_refresh_canonical_current_state"(affected."company_id", affected."entity_name");
  END LOOP;
END
$$;
