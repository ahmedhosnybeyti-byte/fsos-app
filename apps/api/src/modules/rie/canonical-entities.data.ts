// RIE Graph Builder — Canonical Entity Registry.
//
// Source of truth: FSOS_Canonical_Database_v1.0.xlsx, sheet "_Canonical
// Model". These 19 entity names are copied LITERALLY from that sheet's
// "Entity" column (including spacing) — Graph Builder's Unknown Entity
// validation (see graph-builder.errors.ts) depends on exact string
// equality against this list. Do not rename, abbreviate, or pluralize
// differently than the source file.
//
// This file is read-only reference data. It does not modify the Canonical
// Database, and it introduces no new entities.

export type CanonicalEntityType = "Master" | "Master (Temporal)" | "Operational" | "Operational (Snapshot)" | "Planning";

export interface CanonicalEntityDefinition {
  /** Literal entity name, exactly as it appears in _Canonical Model. */
  entityName: string;
  entityType: CanonicalEntityType;
  primaryKey: string;
  notes: string | null;
}

export const CANONICAL_ENTITIES: readonly CanonicalEntityDefinition[] = [
  { entityName: "Companies", entityType: "Master", primaryKey: "CompanyID", notes: null },
  {
    entityName: "Sales Calendar",
    entityType: "Master",
    primaryKey: "CalendarDate",
    notes: "Single time reference for all engines (SGI, Demand, Forecasting, Executive Studio...)",
  },
  { entityName: "Regions", entityType: "Master", primaryKey: "RegionID", notes: "FK: CompanyID" },
  { entityName: "Branches", entityType: "Master", primaryKey: "BranchID", notes: "FK: RegionID" },
  { entityName: "Employees", entityType: "Master", primaryKey: "EmployeeID", notes: "FK: DirectManagerID, BranchID" },
  {
    entityName: "Routes",
    entityType: "Master",
    primaryKey: "RouteID",
    notes: "FK: SalesRepID/SupervisorID/ManagerID (current state), BranchID",
  },
  {
    entityName: "Route Assignments",
    entityType: "Master (Temporal)",
    primaryKey: "AssignmentID",
    notes: "History of Employee-Route. Enables RIE Historical/Expired relationships",
  },
  {
    entityName: "Customers",
    entityType: "Master",
    primaryKey: "CustomerCode",
    notes: "FK: RouteID, BranchID, DefaultPriceListCode",
  },
  { entityName: "Products", entityType: "Master", primaryKey: "ProductCode", notes: "NetWeightKG required for WeightTarget KPI" },
  {
    entityName: "Price List",
    entityType: "Master (Temporal)",
    primaryKey: "PriceListCode+ProductCode+Unit+StartDate",
    notes: "Date-effective pricing",
  },
  { entityName: "Invoices", entityType: "Operational", primaryKey: "InvoiceNo", notes: "RouteID = temporal snapshot (intentional denormalization)" },
  { entityName: "Invoice Items", entityType: "Operational", primaryKey: "InvoiceNo+LineNo", notes: "RouteID = intentional denormalization" },
  { entityName: "Visits", entityType: "Operational", primaryKey: "VisitID", notes: "Backbone of field execution: strike rate, coverage, productive calls" },
  { entityName: "Van Loads", entityType: "Operational", primaryKey: "LoadNo+ProductCode+Unit", notes: "Custody reconciliation: Load - Sales - Returns = Inventory" },
  { entityName: "Van Inventory", entityType: "Operational (Snapshot)", primaryKey: "ReportDate+RouteID+ProductCode+Unit", notes: null },
  { entityName: "Collections", entityType: "Operational", primaryKey: "CollectionNo", notes: "InvoiceNo empty = on-account payment" },
  { entityName: "Returns", entityType: "Operational", primaryKey: "ReturnNo", notes: "Header" },
  { entityName: "Return Items", entityType: "Operational", primaryKey: "ReturnNo+LineNo", notes: "Items" },
  { entityName: "Targets", entityType: "Planning", primaryKey: "Month+Year+RouteID", notes: null },
] as const;

export const CANONICAL_ENTITY_NAMES: ReadonlySet<string> = new Set(CANONICAL_ENTITIES.map((e) => e.entityName));

export function isCanonicalEntity(name: string): boolean {
  return CANONICAL_ENTITY_NAMES.has(name);
}
