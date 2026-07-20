// Shared dataset filter/aggregate/sort/project machinery — extracted out of
// gpt.service.ts (where it originally lived, serving only the external
// ChatGPT Custom GPT's Actions) so the native Assistant module's
// query_dataset tool can reuse the exact same filtering/aggregation
// semantics instead of re-implementing (and potentially drifting from) it.
// gpt.service.ts now imports from here too — behavior there is unchanged,
// this is a pure extraction.
import { BadRequestException } from "@nestjs/common";
import type { File } from "@field-sales-os/database";
import type { AggregateSpec, FilterOperatorSpec } from "@field-sales-os/schemas";

export type DatasetRow = Record<string, unknown>;

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const COLUMN_ALIASES: Record<"customerId" | "invoiceId" | "routeId" | "salesRep", string[]> = {
  customerId: ["customercode", "customerid", "custcode", "custid", "clientcode", "clientid"],
  invoiceId: ["invoiceno", "invoiceid", "invoicenumber", "invno"],
  routeId: ["routeid", "routecode", "routeno", "route"],
  salesRep: ["salesrep", "rep", "repname", "salesrepname", "repcode"],
};

// Finds the real header name (original casing) matching one of the given
// filter's known aliases, or null if this dataset has no such column.
export function resolveColumnAlias(headers: string[], filterName: keyof typeof COLUMN_ALIASES): string | null {
  const aliasSet = new Set(COLUMN_ALIASES[filterName]);
  return headers.find((h) => aliasSet.has(normalizeHeader(h))) ?? null;
}

export function valuesMatch(cellValue: unknown, expected: string): boolean {
  if (cellValue === null || cellValue === undefined) return false;
  return String(cellValue).trim().toLowerCase() === expected.trim().toLowerCase();
}

export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// One column's operator spec against one cell — every key present on the
// spec must pass (AND), same as filters already ANDs across columns. A cell
// that can't be read as the operator's type (not a date, not a number, not
// present) fails the condition rather than being silently skipped, so an
// operator filter never accidentally widens into "match everything".
export function matchesFilterOperatorSpec(cellValue: unknown, spec: FilterOperatorSpec): boolean {
  if (spec.dateFrom !== undefined || spec.dateTo !== undefined) {
    const cellDate = toDate(cellValue);
    if (!cellDate) return false;
    if (spec.dateFrom !== undefined && cellDate < toDate(spec.dateFrom)!) return false;
    if (spec.dateTo !== undefined && cellDate > toDate(spec.dateTo)!) return false;
  }

  const hasNumericOp =
    spec.greaterThan !== undefined ||
    spec.greaterThanOrEqual !== undefined ||
    spec.lessThan !== undefined ||
    spec.lessThanOrEqual !== undefined ||
    spec.between !== undefined;
  if (hasNumericOp) {
    const n = toNumeric(cellValue);
    if (n === null) return false;
    if (spec.greaterThan !== undefined && !(n > spec.greaterThan)) return false;
    if (spec.greaterThanOrEqual !== undefined && !(n >= spec.greaterThanOrEqual)) return false;
    if (spec.lessThan !== undefined && !(n < spec.lessThan)) return false;
    if (spec.lessThanOrEqual !== undefined && !(n <= spec.lessThanOrEqual)) return false;
    if (spec.between !== undefined && !(n >= spec.between[0] && n <= spec.between[1])) return false;
  }

  if (spec.contains !== undefined || spec.startsWith !== undefined || spec.endsWith !== undefined) {
    if (cellValue === null || cellValue === undefined) return false;
    const str = String(cellValue).trim().toLowerCase();
    if (spec.contains !== undefined && !str.includes(spec.contains.trim().toLowerCase())) return false;
    if (spec.startsWith !== undefined && !str.startsWith(spec.startsWith.trim().toLowerCase())) return false;
    if (spec.endsWith !== undefined && !str.endsWith(spec.endsWith.trim().toLowerCase())) return false;
  }

  if (spec.in !== undefined && !spec.in.some((v) => valuesMatch(cellValue, v))) return false;

  return true;
}

export interface DatasetQueryFilters {
  customerId?: string;
  invoiceId?: string;
  routeId?: string;
  salesRep?: string;
  search?: string;
  filters?: Record<string, string | FilterOperatorSpec>;
}

// Applies every provided filter with AND semantics, returning only the
// matching rows — this (plus the caller's limit/offset) is what keeps a
// response from ever again being the entire dataset. Executes in-memory in
// Node before pagination/aggregation — there is no row-level Postgres store
// to push this into.
export function filterRows(rows: DatasetRow[], headers: string[], query: DatasetQueryFilters): DatasetRow[] {
  const namedColumns: Array<{ column: string; value: string }> = [];
  for (const key of ["customerId", "invoiceId", "routeId", "salesRep"] as const) {
    const value = query[key];
    if (!value) continue;
    const column = resolveColumnAlias(headers, key);
    if (!column) {
      throw new BadRequestException(
        `No column matching "${key}" was found in this dataset. Available columns: ${headers.join(", ")}. Use "filters" with the exact column name instead.`,
      );
    }
    namedColumns.push({ column, value });
  }

  const genericFilters = Object.entries(query.filters ?? {}).map(([key, value]) => {
    const column = headers.find((h) => h.toLowerCase() === key.toLowerCase());
    if (!column) {
      throw new BadRequestException(`filters column "${key}" was not found in this dataset. Available columns: ${headers.join(", ")}.`);
    }
    return { column, value };
  });

  const search = query.search?.trim().toLowerCase();

  return rows.filter((row) => {
    for (const { column, value } of [...namedColumns, ...genericFilters]) {
      const matches = typeof value === "string" ? valuesMatch(row[column], value) : matchesFilterOperatorSpec(row[column], value);
      if (!matches) return false;
    }
    if (search) {
      const rowMatchesSearch = Object.values(row).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(search));
      if (!rowMatchesSearch) return false;
    }
    return true;
  });
}

// Row-level access control (strategic point 3). Post-ADR-001, this has no
// manual per-file configuration left at all: the only input is
// `routeAllowedValues`, a Set of RouteIDs the current user may see (or
// `null` for an unrestricted role), resolved exclusively from the Canonical
// Routes/Employees Datasets by CanonicalHierarchyResolverService (see
// rie/canonical-hierarchy-resolver.service.ts) — fixed field names
// (RouteID/SalesRepID/SupervisorID/ManagerID/EmployeeID/Email), never a
// user-picked column. Every dataset reader shares this one function now:
// ExcelDatasetEntityProvider (Canonical Entities) and gpt.service.ts (the
// external Custom GPT Action, migrated off its old manual
// repColumn/supervisorColumn/managerColumn + Route Hierarchy Config path).
//
//   - `routeAllowedValues === null`: no restriction applies (SUPER_ADMIN /
//     COMPANY_ADMIN, or any role the resolver doesn't scope) — full,
//     unfiltered visibility.
//   - `routeAllowedValues` is a Set (SALES_REP / SUPERVISOR / MANAGER):
//     rows are kept only if this dataset has a RouteID-aliased column
//     (see COLUMN_ALIASES.routeId) AND that row's value is in the set. A
//     dataset with no RouteID column at all (Products, Price List, ...) is
//     left unfiltered — there's nothing to scope it by, same as before.
//     An empty Set (resolver failed closed — e.g. no Routes dataset
//     uploaded yet) hides every row of every RouteID-bearing dataset,
//     which is the safer wrong answer for an access-control check.
export interface HierarchyFilterUser {
  roleCode: string;
  email: string;
}

export function applyHierarchyFilter(rows: DatasetRow[], headers: string[], routeAllowedValues: Set<string> | null): DatasetRow[] {
  if (!routeAllowedValues) return rows;

  const routeIdColumn = resolveColumnAlias(headers, "routeId");
  if (!routeIdColumn) return rows;

  return rows.filter((row) => {
    const v = row[routeIdColumn];
    return v !== null && v !== undefined && routeAllowedValues.has(String(v).trim().toLowerCase());
  });
}

// (computeAllowedRouteIds used to live here — the role-branching
// resolution logic. Superseded 2026-07-19 by the configurable
// DirectManagerID-closure model, which lives entirely in
// rie/canonical-hierarchy-resolver.service.ts. This file keeps only the
// generic applyHierarchyFilter above.)

// Invoice Header/Items join (Task #140). Several modules (Geo Intelligence,
// Heat Map's Lost Sales/Opportunity) were built assuming ONE flat sales file
// with customer + location + SKU + value all on the same row. Now that
// Invoices can be split into a Header (customer/date, one row per invoice)
// and Items (SKU/qty/price, one row per line, FK'd back to the header by
// invoice number), those modules need a row set that still looks like the
// old flat shape. This does that: for each Items row, find its Header row
// by invoice number and merge them into one synthetic row (item fields win
// on any name collision) — every existing aggregation function downstream
// keeps working unchanged because it never sees the join, just wider rows.
// Routes/Employees-sized files this is not; Invoice Items can be large, so
// the header lookup is a Map (O(1)), not a scan — still a single in-memory
// pass overall, same performance shape as everything else in this file.
// Item rows whose invoice number has no matching header are dropped (not
// silently zero-filled) and counted, same "honest about what got excluded"
// convention as excludedBadCoordinates/skippedNonNumericRows elsewhere.
export interface JoinResult {
  rows: DatasetRow[];
  excludedNoHeaderMatch: number;
}

export function joinInvoiceHeaderAndItems(
  headerRows: DatasetRow[],
  headerHeaders: string[],
  headerInvoiceNumberColumn: string,
  itemRows: DatasetRow[],
  itemHeaders: string[],
  itemInvoiceNumberColumn: string,
): JoinResult {
  const headerInvoiceCol = headerHeaders.find((h) => h.toLowerCase() === headerInvoiceNumberColumn.toLowerCase());
  const itemInvoiceCol = itemHeaders.find((h) => h.toLowerCase() === itemInvoiceNumberColumn.toLowerCase());
  if (!headerInvoiceCol) {
    throw new BadRequestException(`Column "${headerInvoiceNumberColumn}" was not found in the header dataset`);
  }
  if (!itemInvoiceCol) {
    throw new BadRequestException(`Column "${itemInvoiceNumberColumn}" was not found in the items dataset`);
  }

  const headerByInvoice = new Map<string, DatasetRow>();
  for (const row of headerRows) {
    const key = String(row[headerInvoiceCol] ?? "").trim().toLowerCase();
    if (!key || headerByInvoice.has(key)) continue; // first header row wins, mirrors buildCustomerIndex's dedupe convention
    headerByInvoice.set(key, row);
  }

  const rows: DatasetRow[] = [];
  let excludedNoHeaderMatch = 0;
  for (const item of itemRows) {
    const key = String(item[itemInvoiceCol] ?? "").trim().toLowerCase();
    const header = key ? headerByInvoice.get(key) : undefined;
    if (!header) {
      excludedNoHeaderMatch++;
      continue;
    }
    rows.push({ ...header, ...item });
  }
  return { rows, excludedNoHeaderMatch };
}

export function resolveExactColumn(headers: string[], name: string): string {
  const column = headers.find((h) => h.toLowerCase() === name.toLowerCase());
  if (!column) {
    throw new BadRequestException(`Column "${name}" was not found in this dataset. Available columns: ${headers.join(", ")}.`);
  }
  return column;
}

export interface AggregateResult {
  value: number;
  rowsAggregated: number;
  skippedNonNumericRows: number;
}

// Non-numeric/blank cells are skipped rather than treated as errors or
// zeros — same behavior a spreadsheet's SUM/AVERAGE gives on mixed columns
// — but the count is reported so the caller can be honest about it rather
// than silently presenting a figure that quietly ignored bad data.
export function computeAggregate(op: AggregateSpec["op"], rows: DatasetRow[], column: string | undefined): AggregateResult {
  if (op === "count") {
    return { value: rows.length, rowsAggregated: rows.length, skippedNonNumericRows: 0 };
  }
  const numbers: number[] = [];
  let skipped = 0;
  for (const row of rows) {
    const n = toNumeric(row[column!]);
    if (n === null) skipped++;
    else numbers.push(n);
  }
  let value = 0;
  if (numbers.length > 0) {
    if (op === "sum") value = numbers.reduce((a, b) => a + b, 0);
    else if (op === "avg") value = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    else if (op === "min") value = Math.min(...numbers);
    else value = Math.max(...numbers); // "max"
  }
  return { value, rowsAggregated: numbers.length, skippedNonNumericRows: skipped };
}

type SortDir = "asc" | "desc";

// Numeric or date compare when both sides parse as that type (reusing the
// same coercion filters/aggregate already use, so a column sorts the same
// way it filters), otherwise a case-insensitive natural string compare —
// this is what makes sorting work uniformly across text/numeric/date
// columns without the caller declaring the column's type up front.
export function compareValues(a: unknown, b: unknown): number {
  const an = toNumeric(a);
  const bn = toNumeric(b);
  if (an !== null && bn !== null) return an - bn;

  const ad = toDate(a);
  const bd = toDate(b);
  if (ad !== null && bd !== null) return ad.getTime() - bd.getTime();

  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

// Blank cells always sort last, in either direction. Ties preserve original
// relative order (stable).
export function sortRows(rows: DatasetRow[], column: string, dir: SortDir): DatasetRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const av = a.row[column];
      const bv = b.row[column];
      const aBlank = av === null || av === undefined || av === "";
      const bBlank = bv === null || bv === undefined || bv === "";
      if (aBlank && bBlank) return a.index - b.index;
      if (aBlank) return 1;
      if (bBlank) return -1;
      const cmp = compareValues(av, bv);
      return (dir === "desc" ? -cmp : cmp) || a.index - b.index;
    })
    .map((entry) => entry.row);
}

export function resolveColumns(headers: string[], names: string[]): string[] {
  return names.map((name) => resolveExactColumn(headers, name));
}

export function projectRow(row: DatasetRow, columns: string[]): DatasetRow {
  const projected: DatasetRow = {};
  for (const column of columns) projected[column] = row[column];
  return projected;
}

// The only "columns" that exist on a grouped-aggregate result — distinct
// from the dataset's own headers, so sortBy is validated against this fixed
// set instead of resolveExactColumn when groupBy is active.
export const GROUP_SORT_FIELDS = ["groupValue", "value", "rowCount"] as const;
export type GroupSortField = (typeof GROUP_SORT_FIELDS)[number];

export function resolveGroupSortField(sortBy: string): GroupSortField {
  const match = GROUP_SORT_FIELDS.find((f) => f.toLowerCase() === sortBy.toLowerCase());
  if (!match) {
    throw new BadRequestException(`sortBy "${sortBy}" is not valid when grouping — use one of: ${GROUP_SORT_FIELDS.join(", ")}.`);
  }
  return match;
}

export function sortGroups<T extends { groupValue: string; rowCount: number; value: number }>(groups: T[], field: GroupSortField, dir: SortDir): T[] {
  return [...groups].sort((a, b) => {
    const cmp = field === "groupValue" ? String(a[field]).localeCompare(String(b[field]), undefined, { sensitivity: "base", numeric: true }) : a[field] - b[field];
    return dir === "desc" ? -cmp : cmp;
  });
}

// ---- Dataset metadata summary (used to tell the model what's available) ---

export interface ColumnSummary {
  name: string;
  type: "numeric" | "date" | "boolean" | "text" | "empty";
  nullable: boolean;
  min?: number | string;
  max?: number | string;
  distinctValues?: string[];
}

export interface DetectedSummary {
  period?: { from: string; to: string };
  region?: string[];
  branch?: string[];
  salesRep?: string[];
  route?: string[];
}

export interface DatasetSummary {
  id: string;
  datasetType: string;
  fileName: string;
  rowCount: number | null;
  headers: string[] | null;
  columns: ColumnSummary[] | null;
  detected: DetectedSummary | null;
}

// Lightweight metadata the model uses to decide which dataset(s) are
// relevant to a question — never the full row data (that's a separate
// query_dataset/getDataset call per fileId, since row data can be large).
export function toDatasetSummary(file: Pick<File, "id" | "datasetType" | "fileName" | "parsedMetadata">): DatasetSummary {
  const metadata = file.parsedMetadata as { rowCount?: number; headers?: string[]; columns?: ColumnSummary[]; detected?: DetectedSummary } | null;
  return {
    id: file.id,
    datasetType: file.datasetType,
    fileName: file.fileName,
    rowCount: metadata?.rowCount ?? null,
    headers: metadata?.headers ?? null,
    columns: metadata?.columns ?? null,
    detected: metadata?.detected ?? null,
  };
}
