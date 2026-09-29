import { IMPORT_TEMPLATES } from "../import-validation/import-templates.data";

// Only entities whose legacy Excel provider already reads the canonical
// current-state table with the official template headers are eligible for
// Assistant's PostgreSQL-first query_dataset path. Keeping this list closed
// prevents an arbitrary entity or JSON field from becoming SQL input.
const ASSISTANT_POSTGRES_ENTITIES = new Set([
  "Branches",
  "Employees",
  "Routes",
  "Route Assignments",
  "Products",
  "Price List",
  "Customers",
  "Invoices",
  "Invoice Items",
  "Visits",
  "Van Loads",
  "Van Inventory",
  "Collections",
  "Returns",
  "Return Items",
  "Targets",
]);

const fieldsByEntity = new Map(
  IMPORT_TEMPLATES
    .filter((template) => ASSISTANT_POSTGRES_ENTITIES.has(template.entity))
    .map((template) => [template.entity, template.fields.map((field) => field.name)] as const),
);

export function assistantDatasetFields(entityName: string): readonly string[] | null {
  return fieldsByEntity.get(entityName) ?? null;
}
