// Phase 7 — File Mapping. Responsible only for translating a File's
// classifier-assigned `datasetType` ("Customers", "Invoice Items", ...) into
// the canonical entity name used by the Schema Registry ("CUSTOMERS",
// "INVOICE_ITEMS", ...). This is a pure naming normalization — it does NOT
// transform row data or load anything into an entity table (no such table
// exists in Company Management's scope; actual entity persistence remains a
// future, explicitly-approved initiative for whichever engine owns it).
export function toSchemaEntityName(datasetType: string): string {
  return datasetType
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
