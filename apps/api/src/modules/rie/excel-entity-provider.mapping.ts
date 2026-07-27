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
  // Corrected 2026-07-27 — the "TENTATIVE / best-effort against an old
  // heuristic classifier" framing above (Pricing/Inventory datasetType
  // labels) predates ADR-002. Since ADR-002, File.datasetType is set
  // LITERALLY to ImportTemplate.entity at upload time (see
  // ImportTemplateMatcherService's strict official-sheet-name match,
  // files.service.ts's `datasetType = template.entity`) — there is no
  // longer any heuristic guessing step to be "tentative" about. Any sheet
  // uploaded under its official Canonical Database name gets
  // File.datasetType === that exact name, so the correct mapping for every
  // officially-named entity is always datasetType === entityName,
  // CONFIDENT — matching the pattern already used for Invoices/Customers/
  // Invoice Items/etc above. Discovered as a real gap (not just stale
  // docs): ExcelDatasetEntityProvider.isAvailable/getRecords actively
  // consult isEntityMapped/ENTITY_DATASET_TYPE_MAP before reading files, so
  // a wrong or "TENTATIVE" entry here was silently returning
  // unavailable/mismatched data for confirmed uploads of these three
  // entities specifically. RouteID's presence on Van Inventory is what
  // distinguishes it from any other generic stock sheet — but since
  // classification is now name-based, not header-based, that distinction
  // is already enforced by ImportTemplateMatcherService at upload time, not
  // needed again here.
  "Price List": { datasetType: "Price List", confidence: "CONFIDENT" },
  "Van Inventory": { datasetType: "Van Inventory", confidence: "CONFIDENT" },
  "Van Loads": { datasetType: "Van Loads", confidence: "CONFIDENT" },
  // Return Items classifies exactly like Invoice Items above — matched by
  // its own official sheet name at upload, inheriting no fields from
  // Returns' own classification (each sheet is independently name-matched).
  "Return Items": { datasetType: "Return Items", confidence: "CONFIDENT" },
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
  // UNMAPPED — genuinely no path to this entity's data at all: either no
  // uploaded-sheet concept exists for it (Companies/Regions/Branches are
  // Prisma-native, never an Excel upload) or the platform has no table
  // capturing it yet (Route Assignments). Van Loads/Return Items were
  // listed here too until 2026-07-27 — that was stale: both ARE real
  // official Import Templates (see import-templates.data.ts) and, per
  // ADR-002, get File.datasetType set to their own literal entity name at
  // upload just like every other officially-named sheet. See the corrected
  // CONFIDENT entries above.
  Companies: { datasetType: "", confidence: "TENTATIVE", note: "UNMAPPED — Companies exists as a real Prisma table, not an uploaded dataset. Not served by this provider." },
  Regions: { datasetType: "", confidence: "TENTATIVE", note: "UNMAPPED — no dataset classifier; represented today only as OrgUnit rows (Prisma), not an uploaded dataset." },
  Branches: { datasetType: "", confidence: "TENTATIVE", note: "UNMAPPED — no dataset classifier; represented today only as OrgUnit rows (Prisma), not an uploaded dataset." },
  "Route Assignments": { datasetType: "", confidence: "TENTATIVE", note: "UNMAPPED — no dataset classifier and no Prisma table; Route Assignment history is not captured anywhere in the running platform yet." },
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
