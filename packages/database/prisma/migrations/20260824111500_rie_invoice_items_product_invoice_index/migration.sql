-- PostgreSQL expression index for the bounded Smart Loading stale-purchases
-- RIE query. This migration must be applied outside a transaction because it
-- uses CONCURRENTLY (production rollout records it with `migrate resolve`).
CREATE INDEX CONCURRENTLY "rie_entity_rows_invoice_items_product_invoice_idx"
ON "rie_entity_rows" (
  "dataset_version_id",
  (LOWER(BTRIM(COALESCE("data" ->> 'ProductCode', '')))),
  (LOWER(BTRIM(COALESCE("data" ->> 'InvoiceNo', ''))))
)
WHERE "entity_name" = 'Invoice Items';
