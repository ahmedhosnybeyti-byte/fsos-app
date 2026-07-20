// RIE — Canonical Entity -> uploaded-dataset mapping for ExcelDatasetProvider.
//
// The platform's dataset classifier (apps/api/src/modules/files/classification
// /dataset-classification-rules.ts) recognizes a fixed set of datasetType
// labels when a company uploads an Excel file. That list was built before
// the Canonical Database / RIE existed and does not name-match all 19
// Canonical Entities 1:1. This file is the single, explicit, easily-audited
// place where that gap is bridged — nothing in ExcelDatasetProvider itself
// guesses at a mapping.
//
// CONFIDENT  — the Canonical Entity name and an existing datasetType refer
//              to the same real-world dataset beyond reasonable doubt.
// TENTATIVE  — a plausible but unconfirmed correspondence to an existing
//              datasetType with a different name. Flagged in every
//              EntityQueryResult.warnings so callers (and the user) can see
//              it, never silently treated as equivalent to CONFIDENT.
// UNMAPPED   — no existing datasetType corresponds to this Canonical Entity
//              at all. ExcelDatasetProvider reports this entity as
//              unavailable (NO_DATA_SOURCE_MAPPED) rather than fabricating
//              a mapping.

export type EntityMappingConfidence = "CONFIDENT" | "TENTATIVE";

export interface EntityDatasetMapping {
  datasetType: string;
  confidence: EntityMappingConfidence;
  note?: string;
}

// Keyed by literal Canonical Entity name (canonical-entities.data.ts).
export const ENTITY_DATASET_TYPE_MAP: Readonly<Record<string, EntityDatasetMapping>> = {
  Customers: { datasetType: "Customers", confidence: "CONFIDENT" },
  Routes: { datasetType: "Routes", confidence: "CONFIDENT" },
  Employees: { datasetType: "Employees", confidence: "CONFIDENT" },
  Products: { datasetType: "Products", confidence: "CONFIDENT" },
  Invoices: { datasetType: "Invoices", confidence: "CONFIDENT" },
  "Invoice Items": { datasetType: "Invoice Items", confidence: "CONFIDENT" },
  Returns: { datasetType: "Returns", confidence: "CONFIDENT" },
  Visits: { datasetType: "Visits", confidence: "CONFIDENT" },
  Collections: { datasetType: "Collections", confidence: "CONFIDENT" },
  Targets: {
    datasetType: "Targets",
    confidence: "CONFIDENT",
    note: "Excel-uploaded Targets dataset only. A separate, structurally different Target Prisma model also exists (used by the Targets/SGI modules) — not served by this provider. See report.",
  },
  "Price List": {
    datasetType: "Pricing",
    confidence: "TENTATIVE",
    note: "Best-effort match against the platform's existing \"Pricing\" dataset classifier. Not confirmed to carry the exact Price List structure documented in the Canonical Database (PriceListCode+ProductCode+Unit+StartDate).",
  },
  "Van Inventory": {
    datasetType: "Inventory",
    confidence: "TENTATIVE",
    note: "Best-effort match against the platform's existing \"Inventory\" dataset classifier. Not confirmed to carry Van Inventory's exact snapshot structure (ReportDate+RouteID+ProductCode+Unit).",
  },
  // Sales Calendar (18th official Import Template, added 2026-07-19) is
  // CONFIDENT by construction, not by heuristic classification: confirmed
  // uploads are matched against IMPORT_TEMPLATES by template id, and
  // FilesService sets File.datasetType = template.entity literally (see
  // files.service.ts), so a confirmed Sales Calendar upload's File row
  // always carries datasetType === "Sales Calendar" exactly — no
  // dataset-classification-rules.ts heuristic entry is needed or used.
  // NOTE: this mapping entry exists for documentation/audit completeness
  // only. ExcelDatasetEntityProvider special-cases "Sales Calendar" to read
  // from the real `sales_calendars` Postgres table instead (see
  // excel-entity-provider.service.ts) — this entry's datasetType is not
  // actually consulted for that entity's isAvailable/getRecords path.
  "Sales Calendar": { datasetType: "Sales Calendar", confidence: "CONFIDENT" },
  // UNMAPPED — no existing datasetType classifier for these. Confirmed via
  // dataset-classification-rules.ts audit (only 14 datasetType labels exist
  // platform-wide: Invoices, Invoice Items, Customers, Payments, Returns,
  // Products, Inventory, Pricing, Routes, Employees, Visits, Collections,
  // Targets, Competitors).
  Companies: { datasetType: "", confidence: "TENTATIVE", note: "UNMAPPED — Companies exists as a real Prisma table, not an uploaded dataset. Not served by this provider." },
  Regions: { datasetType: "", confidence: "TENTATIVE", note: "UNMAPPED — no dataset classifier; represented today only as OrgUnit rows (Prisma), not an uploaded dataset." },
  Branches: { datasetType: "", confidence: "TENTATIVE", note: "UNMAPPED — no dataset classifier; represented today only as OrgUnit rows (Prisma), not an uploaded dataset." },
  "Route Assignments": { datasetType: "", confidence: "TENTATIVE", note: "UNMAPPED — no dataset classifier and no Prisma table; Route Assignment history is not captured anywhere in the running platform yet." },
  "Van Loads": { datasetType: "", confidence: "TENTATIVE", note: "UNMAPPED — no dataset classifier for Van Loads specifically." },
  "Return Items": { datasetType: "", confidence: "TENTATIVE", note: "UNMAPPED — no dataset classifier distinct from \"Returns\" (header-level only)." },
} as const;

const UNMAPPED_ENTITIES: ReadonlySet<string> = new Set(
  Object.entries(ENTITY_DATASET_TYPE_MAP)
    .filter(([, m]) => m.datasetType === "")
    .map(([entityName]) => entityName),
);

export function isEntityMapped(entityName: string): boolean {
  const mapping = ENTITY_DATASET_TYPE_MAP[entityName];
  return !!mapping && !UNMAPPED_ENTITIES.has(entityName);
}
