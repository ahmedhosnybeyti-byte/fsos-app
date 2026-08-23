CREATE INDEX "rie_entity_rows_invoice_route_invoice_no_idx"
ON "rie_entity_rows" (
  "dataset_version_id",
  (LOWER(BTRIM(COALESCE("data" ->> 'RouteID', '')))),
  (BTRIM(COALESCE("data" ->> 'InvoiceNo', '')))
)
WHERE "entity_name" IN ('Invoices', 'Invoice Items');
