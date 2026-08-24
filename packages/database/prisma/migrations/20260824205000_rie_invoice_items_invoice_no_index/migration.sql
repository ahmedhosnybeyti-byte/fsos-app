-- Lets Smart Loading start from the scoped invoice-key set and fetch only
-- matching Invoice Items before the product-level last-sale aggregation.
CREATE INDEX "rie_entity_rows_invoice_items_invoice_no_idx"
ON "rie_entity_rows" (
  "dataset_version_id",
  (LOWER(BTRIM(COALESCE("data" ->> 'InvoiceNo', ''))))
)
WHERE "entity_name" = 'Invoice Items';
