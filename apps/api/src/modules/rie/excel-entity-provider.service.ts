import { Injectable, Logger } from "@nestjs/common";
import * as XLSX from "xlsx";
import { FilesService } from "../files/files.service";
import { applyHierarchyFilter, normalizeHeader, type DatasetRow } from "../files/dataset-query.util";
import type {
  EntityFieldFilter,
  EntityProvider,
  EntityQueryOptions,
  EntityQueryResult,
  EntityRecord,
} from "./entity-provider.interface";
import { ENTITY_DATASET_TYPE_MAP, isEntityMapped } from "./excel-entity-provider.mapping";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import { IMPORT_TEMPLATES } from "../import-validation/import-templates.data";
import { serializeExcelParse } from "../../common/excel-parse-queue";

// Official primary key per Canonical Entity, straight from the Import
// Templates — powers the incremental-update merge in getRecords: when a
// company has several active uploads of the same entity (e.g. invoices for
// Jan–Jun uploaded last month, then a fresh file with July 1–19), rows are
// deduplicated by this key with the NEWEST upload winning. That makes an
// upload additive/upserting by default: new keys extend the data, re-sent
// keys override the older version, and nothing requires re-uploading the
// full history every time.
const ENTITY_PRIMARY_KEY: ReadonlyMap<string, readonly string[]> = new Map(IMPORT_TEMPLATES.map((t) => [t.entity, t.primaryKey]));

// Canonical Entity name for the one entity this provider serves out of a
// real Postgres table instead of re-parsed Excel bytes — see the
// SALES_CALENDAR_FIELDS block below and the class doc comment.
const SALES_CALENDAR_ENTITY = "Sales Calendar";
const INVOICES_ENTITY = "Invoices";
const INVOICE_ITEMS_ENTITY = "Invoice Items";
const COLLECTIONS_ENTITY = "Collections";
const RETURNS_ENTITY = "Returns";
const RETURN_ITEMS_ENTITY = "Return Items";
const VAN_INVENTORY_ENTITY = "Van Inventory";
const VAN_LOADS_ENTITY = "Van Loads";
const VISITS_ENTITY = "Visits";
const EMPLOYEES_ENTITY = "Employees";
const PRICE_LIST_ENTITY = "Price List";
const TARGETS_ENTITY = "Targets";
const PRODUCTS_ENTITY = "Products";
const ROUTE_ASSIGNMENTS_ENTITY = "Route Assignments";
const ROUTES_ENTITY = "Routes";
const BRANCHES_ENTITY = "Branches";

// Official Import Template field names (PascalCase, exactly as in
// import-templates.data.ts's IMPORT-SALES-CALENDAR-v1.0 `fields`), in
// display order — this, not the Postgres camelCase column names, is the
// shape downstream RIE consumers (Navigation Engine, filters, Registry
// foreignKey resolution) must see, matching every other Canonical Entity
// served by this provider off of Excel headers.
const SALES_CALENDAR_FIELDS = [
  "CalendarDate",
  "Day",
  "Week",
  "Month",
  "Quarter",
  "Year",
  "WorkingDay",
  "Holiday",
  "Season",
  "Ramadan",
  "PromotionSeason",
] as const;

// WorkingDay/Ramadan are Postgres Boolean? columns, but the Import Template
// declares them as Enum ["Yes","No"] — same string-based yes/no convention
// every other Excel-sourced column in this system uses. null passes through
// as null (not ""), matching this file's/RIE's existing convention for a
// genuinely absent optional value (see e.g. DatasetSummary's
// `rowCount: metadata?.rowCount ?? null` in dataset-query.util.ts) — every
// existing consumer of EntityRecord cell values already normalizes
// null/undefined the same way (`cell ?? ""`, see matchesEntityFilter below),
// so this is a distinction without a behavioral difference downstream.
function boolToYesNo(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "Yes" : "No";
}

function stableRows(rows: readonly unknown[]): string {
  const serialize = (value: unknown): string => {
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (typeof value === "number") return JSON.stringify(Number(value.toPrecision(15)));
    if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
    if (value !== null && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${serialize((value as Record<string, unknown>)[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return rows.map(serialize).sort().join("\n");
}

// Phase 2 verifies the customer fields defined by the import contract. This
// ignores worksheet-only empty-cell representation while retaining every
// business field served to Customers consumers.
const CUSTOMERS_BASIC_FIELDS = [
  "CustomerCode", "CustomerName", "RouteID", "VisitDay", "VisitSequence",
  "Channel", "CustomerClass", "CustomerType", "Address", "City",
  "Latitude", "Longitude", "Phone", "CommercialRegistration", "TaxNumber",
  "PaymentTerms", "CreditLimit", "DefaultPriceListCode", "Status", "BranchID",
] as const;

function basicCustomerRows(rows: readonly DatasetRow[]): Record<string, unknown>[] {
  return rows.map((row) => Object.fromEntries(CUSTOMERS_BASIC_FIELDS.map((field) => [field, row[field] ?? null])));
}
// ------------------------------------------------------------------
// Parsed-dataset cache (2026-07-20, memory-explosion fix).
//
// Root cause this addresses: every call to getRecords() used to download
// the file(s) fresh and run XLSX.read + sheet_to_json (memory-heavy — one
// full JS object per row) from scratch, every single time, with zero
// reuse. Screens that read the same handful of entities several times in
// one user interaction (Visit Copilot's daily-brief -> plan -> discovery
// -> route-opportunities -> briefing, each independently re-reading
// Customers/Invoices/Invoice Items) could re-parse the SAME large Excel
// files 5-10+ times within seconds, several of them concurrently
// (Promise.all) — enough simultaneous large object graphs in the heap at
// once to crash the Node process with "JavaScript heap out of memory".
//
// Fix: cache the parsed-and-merged (but NOT hierarchy-filtered) rows per
// (companyId, entityName), keyed additionally by a signature of exactly
// which active file ids currently back that entity. A new/removed active
// file changes the signature, so the cache invalidates itself automatically
// on the next upload — no TTL-based staleness to reason about for
// correctness, only for bounding memory (see PARSED_DATASET_CACHE_TTL_MS).
//
// Hierarchy filtering is deliberately kept OUT of what's cached: it depends
// on options.requestingUser (a rep and their manager see different row
// subsets of the exact same file), which differs per caller. So this cache
// stores the full merged/deduped dataset and applyHierarchyFilter runs
// fresh on top of it on every getRecords() call — a cheap linear scan,
// unlike the parse it replaces. One consequence worth noting: the
// newest-upload-wins primary-key dedup now runs over every row (not just
// the rows one particular caller can see) so the parsed result can be
// shared across callers with different route visibility. This can only
// differ from the old per-caller-filtered dedup if the same primary-key
// entity's RouteID visibility somehow changed between two uploads of it,
// which isn't a real scenario in this system (a given customer/invoice/
// route's visibility doesn't change from one upload to the next).
// 2026-07-20: bumped from 5 minutes to 5 hours — see FILE_BUFFER_CACHE_TTL_MS
// in files.service.ts for the full reasoning (correctness is signature-based,
// not time-based; this TTL only bounds idle memory).
const PARSED_DATASET_CACHE_TTL_MS = 5 * 60 * 60_000; // 5 hours of inactivity
const PARSED_DATASET_CACHE_MAX_ENTRIES = 300; // bound on (companyId, entityName) pairs held at once

interface ParsedDatasetSnapshot {
  mergedRows: DatasetRow[];
  headers: string[];
  warnings: string[];
}

interface ParsedDatasetCacheEntry {
  signature: string;
  snapshot: Promise<ParsedDatasetSnapshot>;
  createdAt: number;
}

/**
 * RIE — first EntityProvider implementation.
 *
 * Reads Canonical Entity data from the platform's real system-of-record
 * today: uploaded, classified, confirmed Excel datasets (the `File` /
 * `datasetType` mechanism every existing FSOS screen already uses). See
 * entity-provider.interface.ts for why this indirection exists, and
 * excel-entity-provider.mapping.ts for exactly which Canonical Entities this
 * provider can and cannot currently serve.
 *
 * This class knows nothing about Navigation Engine, Query Execution Engine,
 * or relationships — it answers exactly one question: "give me the rows for
 * Canonical Entity X, for company Y, respecting hierarchy visibility."
 */
@Injectable()
export class ExcelDatasetEntityProvider implements EntityProvider {
  private readonly logger = new Logger(ExcelDatasetEntityProvider.name);

  // See "Parsed-dataset cache" comment above. Keyed by `${companyId}::${entityName}`.
  private readonly parsedDatasetCache = new Map<string, ParsedDatasetCacheEntry>();

  constructor(
    private readonly filesService: FilesService,
    private readonly hierarchyResolver: CanonicalHierarchyResolverService,
    private readonly prisma: PrismaService,
  ) {}

  async isAvailable(entityName: string, companyId: string): Promise<boolean> {
    // Sales Calendar's real system-of-record is the `sales_calendars`
    // Postgres table (ingested separately from the confirmed upload), not
    // an uploaded File — see class doc comment. Availability is simply
    // "does this company have any rows there".
    if (entityName === SALES_CALENDAR_ENTITY) {
      const count = await this.prisma.salesCalendar.count({ where: { companyId } });
      return count > 0;
    }

    if (!isEntityMapped(entityName)) return false;
    const mapping = ENTITY_DATASET_TYPE_MAP[entityName];
    if (!mapping) return false;
    const files = await this.filesService.listConfirmedActiveForCompany(companyId);
    return files.some((f: { datasetType: string }) => f.datasetType === mapping.datasetType);
  }

  async getRecords(entityName: string, options: EntityQueryOptions): Promise<EntityQueryResult> {
    if (entityName === SALES_CALENDAR_ENTITY) {
      return this.getSalesCalendarRecords(options);
    }

    const warnings: string[] = [];
    const mapping = ENTITY_DATASET_TYPE_MAP[entityName];

    if (!mapping || !isEntityMapped(entityName)) {
      return {
        entityName,
        available: false,
        unavailableReason: "NO_DATA_SOURCE_MAPPED",
        records: [],
        fields: [],
        warnings: mapping?.note ? [mapping.note] : [`No dataset mapping exists for Canonical Entity "${entityName}".`],
      };
    }

    if (mapping.confidence === "TENTATIVE" && mapping.note) {
      warnings.push(`Tentative mapping in use: "${entityName}" -> datasetType "${mapping.datasetType}". ${mapping.note}`);
    }

    let allFiles;
    try {
      allFiles = await this.filesService.listConfirmedActiveForCompany(options.companyId);
    } catch (err) {
      this.logger.error(`Failed to list files for company ${options.companyId}: ${(err as Error).message}`);
      return {
        entityName,
        available: false,
        unavailableReason: "PROVIDER_ERROR",
        records: [],
        fields: [],
        warnings: [`Provider error while listing datasets: ${(err as Error).message}`],
      };
    }

    const matchingFiles = allFiles.filter((f: { datasetType: string }) => f.datasetType === mapping.datasetType);
    if (matchingFiles.length === 0) {
      return {
        entityName,
        available: false,
        unavailableReason: "NO_ACTIVE_DATASET",
        records: [],
        fields: [],
        warnings: [...warnings, `No active, confirmed dataset of type "${mapping.datasetType}" is uploaded for this company.`],
      };
    }

    if (matchingFiles.length > 1) {
      warnings.push(
        `${matchingFiles.length} active datasets share type "${mapping.datasetType}" for this company; rows are merged with newest-upload-wins deduplication by the entity's official primary key.`,
      );
    }

    // These entities are served from their active PostgreSQL
    // materializations. All other entities retain the established Excel
    // path below.
    if (entityName === "Customers") {
      return this.getCustomersPostgresRecords(options, matchingFiles, warnings);
    }
    if (entityName === INVOICES_ENTITY || entityName === INVOICE_ITEMS_ENTITY || entityName === COLLECTIONS_ENTITY || entityName === RETURNS_ENTITY || entityName === RETURN_ITEMS_ENTITY || entityName === VAN_INVENTORY_ENTITY || entityName === VAN_LOADS_ENTITY || entityName === VISITS_ENTITY || entityName === EMPLOYEES_ENTITY || entityName === PRICE_LIST_ENTITY || entityName === TARGETS_ENTITY || entityName === PRODUCTS_ENTITY || entityName === ROUTE_ASSIGNMENTS_ENTITY || entityName === ROUTES_ENTITY || entityName === BRANCHES_ENTITY) {
      return this.getMaterializedEntityRecords(entityName, options, matchingFiles, warnings);
    }

    // Parse + incremental-update merge (see ENTITY_PRIMARY_KEY above), or
    // reuse the already-parsed result for this exact set of active files —
    // see "Parsed-dataset cache" comment near the top of this file. This is
    // the expensive step (file download + XLSX.read + sheet_to_json), now
    // shared across every caller reading this entity for this company until
    // the active file set changes.
    const tParseStart = Date.now();
    const { mergedRows: rawMergedRows, headers, warnings: parseWarnings } = await this.getParsedDataset(
      options.companyId,
      entityName,
      matchingFiles,
    );
    const tParseEnd = Date.now();
    warnings.push(...parseWarnings);

    // Resolved once per call, not per file — the sole row-level hierarchy
    // filter for Canonical Datasets post-ADR-001 (see
    // canonical-hierarchy-resolver.service.ts). null for an unrestricted
    // role, otherwise the set of RouteIDs this user may see. Deliberately
    // NOT part of the cached parse above — see class-level cache comment.
    const routeAllowedValues = options.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(options.companyId, options.requestingUser)
      : null;
    const tHierarchyEnd = Date.now();
    this.logger.log(
      `[ParseTiming] entity=${entityName} getParsedDataset(await)=${tParseEnd - tParseStart}ms hierarchyResolve=${tHierarchyEnd - tParseEnd}ms`,
    );
    let mergedRows: DatasetRow[] = applyHierarchyFilter(rawMergedRows, headers, routeAllowedValues);

    if (options.filters && options.filters.length > 0) {
      mergedRows = mergedRows.filter((row) => options.filters!.every((f) => matchesEntityFilter(row, headers, f)));
    }

    if (options.limit && mergedRows.length > options.limit) {
      mergedRows = mergedRows.slice(0, options.limit);
    }

    // Phase 2: Customers remains Excel-served. This detached verification
    // reads the same active source files from the Postgres shadow and applies
    // the already-resolved hierarchy scope, filters, and limit. It never
    // affects this response or any consumer-facing read path.
    if (entityName === "Customers") {
      void this.compareCustomersShadow({
        companyId: options.companyId,
        matchingFileIds: matchingFiles.map((file) => file.id),
        headers,
        routeAllowedValues,
        filters: options.filters,
        limit: options.limit,
        excelRows: mergedRows,
      }).catch(() => this.logger.log("[CustomersShadowRead] FAIL"));
    }
    return {
      entityName,
      available: true,
      records: mergedRows as readonly EntityRecord[],
      fields: headers,
      warnings,
    };
  }

  private async getCustomersPostgresRecords(
    options: EntityQueryOptions,
    matchingFiles: { id: string }[],
    warnings: string[],
  ): Promise<EntityQueryResult> {
    return this.getMaterializedEntityRecords("Customers", options, matchingFiles, warnings);
  }

  private async getMaterializedEntityRecords(
    entityName: "Customers" | typeof INVOICES_ENTITY | typeof INVOICE_ITEMS_ENTITY | typeof COLLECTIONS_ENTITY | typeof RETURNS_ENTITY | typeof RETURN_ITEMS_ENTITY | typeof VAN_INVENTORY_ENTITY | typeof VAN_LOADS_ENTITY | typeof VISITS_ENTITY | typeof EMPLOYEES_ENTITY | typeof PRICE_LIST_ENTITY | typeof TARGETS_ENTITY | typeof PRODUCTS_ENTITY | typeof ROUTE_ASSIGNMENTS_ENTITY | typeof ROUTES_ENTITY | typeof BRANCHES_ENTITY,
    options: EntityQueryOptions,
    matchingFiles: { id: string }[],
    warnings: string[],
  ): Promise<EntityQueryResult> {
    const versions = await this.prisma.rieDatasetVersion.findMany({
      where: {
        companyId: options.companyId,
        entityName,
        isActive: true,
        sourceFileId: { in: matchingFiles.map((file) => file.id) },
      },
      select: { id: true, sourceFileId: true },
    });
    const versionByFileId = new Map(versions.map((version) => [version.sourceFileId, version]));
    if (versionByFileId.size !== matchingFiles.length) {
      return {
        entityName,
        available: false,
        unavailableReason: "NO_ACTIVE_DATASET",
        records: [],
        fields: [],
        warnings: [...warnings, `${entityName} PostgreSQL materialization is not active for every active dataset.`],
      };
    }

    const primaryKey = ENTITY_PRIMARY_KEY.get(entityName)!;
    const template = IMPORT_TEMPLATES.find((candidate) => candidate.entity === entityName);
    const headers = template?.fields.map((field) => field.name) ?? [];
    const fieldByNormalizedName = new Map(headers.map((field) => [normalizeHeader(field), field]));
    const routeAllowedValues = options.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(options.companyId, options.requestingUser)
      : null;

    const selectedFiles = matchingFiles.map((file, precedence) => Prisma.sql`(${file.id}, ${precedence})`);
    const cell = (alias: string, field: string) => Prisma.sql`LOWER(BTRIM(COALESCE(${Prisma.raw(alias)}."data" ->> ${field}, '')))`;
    const keyIsBlank = (alias: string) => Prisma.join(primaryKey.map((field) => Prisma.sql`BTRIM(COALESCE(${Prisma.raw(alias)}."data" ->> ${field}, '')) = ''`), " OR ");
    const sameKey = Prisma.join(primaryKey.map((field) => Prisma.sql`${cell("r", field)} = ${cell("newer", field)}`), " AND ");
    const clauses: Prisma.Sql[] = [];
    const routeField = fieldByNormalizedName.get(normalizeHeader("RouteID"));
    if (routeAllowedValues && routeField) {
      const allowed = [...routeAllowedValues];
      clauses.push(allowed.length === 0 ? Prisma.sql`FALSE` : Prisma.sql`${cell("r", routeField)} IN (${Prisma.join(allowed)})`);
    }
    for (const filter of options.filters ?? []) {
      const field = fieldByNormalizedName.get(normalizeHeader(filter.field)) ?? filter.field;
      const valueCell = cell("r", field);
      if (filter.op === "eq") clauses.push(Prisma.sql`${valueCell} = ${String(filter.value ?? "").trim().toLowerCase()}`);
      else if (filter.op === "in") {
        const values = Array.isArray(filter.value) ? filter.value.map((value) => String(value).trim().toLowerCase()) : [];
        clauses.push(values.length === 0 ? Prisma.sql`FALSE` : Prisma.sql`${valueCell} IN (${Prisma.join(values)})`);
      } else if (filter.op === "contains") clauses.push(Prisma.sql`${valueCell} LIKE ${`%${String(filter.value ?? "").toLowerCase()}%`}`);
      else {
        const values = filter.op === "between" ? filter.value as [unknown, unknown] : [filter.value];
        const comparable = values.map((value) => typeof value === "number" ? value : Date.parse(String(value)));
        if (comparable.some((value) => Number.isNaN(value))) clauses.push(Prisma.sql`FALSE`);
        else {
          const numericCell = Prisma.sql`CASE WHEN jsonb_typeof(r."data" -> ${field}) = 'number' THEN (r."data" ->> ${field})::double precision WHEN r."data" ->> ${field} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN EXTRACT(EPOCH FROM (r."data" ->> ${field})::timestamptz) * 1000 ELSE NULL END`;
          clauses.push(filter.op === "gte" ? Prisma.sql`${numericCell} >= ${comparable[0]!}` : filter.op === "lte" ? Prisma.sql`${numericCell} <= ${comparable[0]!}` : Prisma.sql`${numericCell} BETWEEN ${comparable[0]!} AND ${comparable[1]!}`);
        }
      }
    }
    const whereClause = clauses.length ? Prisma.sql`AND ${Prisma.join(clauses, " AND ")}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ data: DatasetRow }>>(Prisma.sql`
      WITH selected_files("source_file_id", precedence) AS (VALUES ${Prisma.join(selectedFiles)}),
      active_versions AS (
        SELECT v.id, selected_files.precedence
        FROM "rie_dataset_versions" v JOIN selected_files ON selected_files."source_file_id" = v."source_file_id"
        WHERE v."company_id" = ${options.companyId} AND v."entity_name" = ${entityName} AND v."is_active" = TRUE
      )
      SELECT r."data" FROM "rie_entity_rows" r JOIN active_versions active ON active.id = r."dataset_version_id"
      WHERE (${keyIsBlank("r")} OR NOT EXISTS (
        SELECT 1 FROM "rie_entity_rows" newer JOIN active_versions newer_active ON newer_active.id = newer."dataset_version_id"
        WHERE newer_active.precedence < active.precedence AND NOT (${keyIsBlank("newer")}) AND ${sameKey}
      )) ${whereClause}
      ORDER BY active.precedence ASC, r."created_at" ASC, r.id ASC
      LIMIT ${options.limit ?? 2147483647}
    `);

    return {
      entityName,
      available: true,
      records: rows.map((row) => row.data) as readonly EntityRecord[],
      fields: headers,
      warnings,
    };
  }

  private async compareCustomersShadow(params: {
    companyId: string;
    matchingFileIds: string[];
    headers: string[];
    routeAllowedValues: Set<string> | null;
    filters: readonly EntityFieldFilter[] | undefined;
    limit: number | undefined;
    excelRows: DatasetRow[];
  }): Promise<void> {
    const { companyId, matchingFileIds, headers, routeAllowedValues, filters, limit, excelRows } = params;
    const versions = await this.prisma.rieDatasetVersion.findMany({
      where: { companyId, entityName: "Customers", isActive: true, sourceFileId: { in: matchingFileIds } },
      select: { id: true, sourceFileId: true },
    });
    const shadowRowsByVersionId = new Map<string, DatasetRow[]>();
    const versionRows = await this.prisma.rieEntityRow.findMany({
      where: { datasetVersionId: { in: versions.map((version) => version.id) } },
      select: { datasetVersionId: true, data: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const row of versionRows) {
      const rows = shadowRowsByVersionId.get(row.datasetVersionId) ?? [];
      rows.push(row.data as DatasetRow);
      shadowRowsByVersionId.set(row.datasetVersionId, rows);
    }
    const versionByFileId = new Map(versions.map((version) => [version.sourceFileId, version]));
    const shadowRows: DatasetRow[] = [];
    const seenCustomerCodes = new Set<string>();
    for (const fileId of matchingFileIds) {
      const version = versionByFileId.get(fileId);
      if (!version) { this.logger.log("[CustomersShadowRead] FAIL"); return; }
      const fileCodes = new Set<string>();
      const fileRows = shadowRowsByVersionId.get(version.id) ?? [];
      for (const row of fileRows) {
        const code = String(row.CustomerCode ?? "").trim().toLowerCase();
        if (!code || seenCustomerCodes.has(code)) continue;
        fileCodes.add(code);
        shadowRows.push(row);
      }
      for (const code of fileCodes) seenCustomerCodes.add(code);
    }
    let filteredShadowRows = applyHierarchyFilter(shadowRows, headers, routeAllowedValues);
    if (filters?.length) filteredShadowRows = filteredShadowRows.filter((row) => filters.every((filter) => matchesEntityFilter(row, headers, filter)));
    if (limit && filteredShadowRows.length > limit) filteredShadowRows = filteredShadowRows.slice(0, limit);
    const sameCount = excelRows.length === filteredShadowRows.length;
    const sameCodes = stableRows(excelRows.map((row) => String(row.CustomerCode ?? "").trim()).sort()) === stableRows(filteredShadowRows.map((row) => String(row.CustomerCode ?? "").trim()).sort());
    const sameData = stableRows(basicCustomerRows(excelRows)) === stableRows(basicCustomerRows(filteredShadowRows));
    this.logger.log(`[CustomersShadowRead] ${sameCount && sameCodes && sameData ? "PASS" : "FAIL"}`);
  }

  private async compareInvoiceShadow(params: {
    entityName: "Invoices" | "Invoice Items";
    companyId: string;
    matchingFileIds: string[];
    headers: string[];
    routeAllowedValues: Set<string> | null;
    filters: readonly EntityFieldFilter[] | undefined;
    limit: number | undefined;
    excelRows: DatasetRow[];
  }): Promise<void> {
    const { entityName, companyId, matchingFileIds, headers, routeAllowedValues, filters, limit, excelRows } = params;
    const versions = await this.prisma.rieDatasetVersion.findMany({
      where: { companyId, entityName, isActive: true, sourceFileId: { in: matchingFileIds } },
      select: { id: true, sourceFileId: true },
    });
    const rows = await this.prisma.rieEntityRow.findMany({
      where: { datasetVersionId: { in: versions.map((version) => version.id) } },
      select: { datasetVersionId: true, data: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const rowsByVersion = new Map<string, DatasetRow[]>();
    for (const row of rows) rowsByVersion.set(row.datasetVersionId, [...(rowsByVersion.get(row.datasetVersionId) ?? []), row.data as DatasetRow]);
    const versionByFile = new Map(versions.map((version) => [version.sourceFileId, version]));
    const primaryKey = entityName === "Invoices" ? ["InvoiceNo"] : ["InvoiceNo", "LineNo"];
    const shadowRows: DatasetRow[] = [];
    const seenKeys = new Set<string>();
    for (const fileId of matchingFileIds) {
      const version = versionByFile.get(fileId);
      if (!version) return this.logger.log(`[${entityName}ShadowRead] FAIL`);
      const fileKeys = new Set<string>();
      for (const row of rowsByVersion.get(version.id) ?? []) {
        const key = primaryKey.map((column) => String(row[column] ?? "").trim()).join("␟").toLowerCase();
        if (key && seenKeys.has(key)) continue;
        if (key) fileKeys.add(key);
        shadowRows.push(row);
      }
      for (const key of fileKeys) seenKeys.add(key);
    }
    let filtered = applyHierarchyFilter(shadowRows, headers, routeAllowedValues);
    if (filters?.length) filtered = filtered.filter((row) => filters.every((filter) => matchesEntityFilter(row, headers, filter)));
    if (limit && filtered.length > limit) filtered = filtered.slice(0, limit);
    const keyOf = (row: DatasetRow) => primaryKey.map((column) => String(row[column] ?? "").trim()).join("␟");
    const pass = excelRows.length === filtered.length
      && stableRows(excelRows.map(keyOf)) === stableRows(filtered.map(keyOf))
      && stableRows(excelRows) === stableRows(filtered);
    this.logger.log(`[${entityName}ShadowRead] ${pass ? "PASS" : "FAIL"}`);
    if (entityName === "Invoice Items") {
      const invoices = await this.prisma.rieEntityRow.findMany({ where: { companyId, entityName: "Invoices", datasetVersion: { isActive: true } }, select: { entityKey: true } });
      const invoiceKeys = new Set(invoices.map((invoice) => invoice.entityKey));
      this.logger.log(`[InvoiceRelationShadowRead] ${filtered.every((row) => invoiceKeys.has(String(row.InvoiceNo ?? "").trim())) ? "PASS" : "FAIL"}`);
    }
  }

  // Returns the cached parsed-and-merged dataset for (companyId, entityName)
  // if the active file set backing it hasn't changed, otherwise parses fresh
  // and caches the result. Concurrent callers for the same key share the
  // same in-flight Promise (stored in the cache before it's awaited), so a
  // burst of near-simultaneous requests (e.g. Visit Copilot's daily-brief
  // and discovery firing close together) triggers exactly one parse.
  private async getParsedDataset(
    companyId: string,
    entityName: string,
    matchingFiles: { id: string; sheetIndex: number; fileName: string }[],
  ): Promise<ParsedDatasetSnapshot> {
    const cacheKey = `${companyId}::${entityName}`;
    const signature = matchingFiles
      .map((f) => f.id)
      .sort()
      .join(",");

    const cached = this.parsedDatasetCache.get(cacheKey);
    if (cached && cached.signature === signature) {
      // Re-insert to move this key to the end of the Map's iteration order
      // — approximates least-recently-used for the eviction pass below.
      this.parsedDatasetCache.delete(cacheKey);
      this.parsedDatasetCache.set(cacheKey, cached);
      return cached.snapshot;
    }

    const snapshot = this.parseDatasetFromFiles(companyId, entityName, matchingFiles);
    this.parsedDatasetCache.set(cacheKey, { signature, snapshot, createdAt: Date.now() });
    this.evictParsedDatasetCache();

    try {
      return await snapshot;
    } catch (err) {
      // Don't keep a failed parse cached — the next call should retry.
      const current = this.parsedDatasetCache.get(cacheKey);
      if (current?.snapshot === snapshot) this.parsedDatasetCache.delete(cacheKey);
      throw err;
    }
  }

  private evictParsedDatasetCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.parsedDatasetCache) {
      if (now - entry.createdAt > PARSED_DATASET_CACHE_TTL_MS) this.parsedDatasetCache.delete(key);
    }
    // Map preserves insertion order — oldest key first once over the cap.
    while (this.parsedDatasetCache.size > PARSED_DATASET_CACHE_MAX_ENTRIES) {
      const oldestKey = this.parsedDatasetCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.parsedDatasetCache.delete(oldestKey);
    }
  }

  // The actual download + XLSX parse + incremental-update merge, factored
  // out of getRecords so it can be cached as a unit by getParsedDataset.
  // Deliberately does NOT apply hierarchy filtering (see class-level cache
  // comment) — dedup here runs over every row, not just one caller's
  // visible subset.
  private async parseDatasetFromFiles(
    companyId: string,
    entityName: string,
    matchingFiles: { id: string; sheetIndex: number; fileName: string }[],
  ): Promise<ParsedDatasetSnapshot> {
    const warnings: string[] = [];
    let mergedRows: DatasetRow[] = [];
    let headers: string[] = [];

    // matchingFiles is ordered newest-first (listConfirmedActiveForCompany
    // orders by createdAt desc), so a row is dropped only when a NEWER file
    // already contributed the same primary-key value. Keys are added to the
    // global seen-set per file AFTER that file is fully read — duplicates
    // WITHIN one file are deliberately kept as-is (the file is served
    // faithfully; ADR-002 made in-file duplicates the client's own
    // responsibility, not something we silently collapse).
    const primaryKey = ENTITY_PRIMARY_KEY.get(entityName) ?? null;
    const seenKeys = new Set<string>();

    for (const file of matchingFiles) {
      try {
        // 2026-07-20 diagnostic instrumentation: first-load-is-slow
        // investigation. Splits the previously-opaque "parse took Xms" into
        // download vs. XLSX.read vs. sheet_to_json so a slow first request
        // (cache miss) can be traced to a specific stage instead of guessed
        // at. Cheap (a handful of Date.now() calls) — safe to leave in.
        const tDownloadStart = Date.now();
        const buffer = await this.filesService.downloadFileBuffer(file.id, companyId);
        const tDownloadEnd = Date.now();
        // 2026-07-20 root-cause fix for the "first load takes 2+ minutes"
        // report: uploads under the multi-sheet batch import (File.batchId,
        // 2026-07-19) store every entity's sheet inside ONE physical .xlsx
        // object — a real seed file measured at 40MB / ~530k data rows
        // across ~19 sheets (Invoice Items alone: 294,927 rows). Plain
        // `XLSX.read(buffer)` parses every sheet in the workbook into JS
        // objects up front regardless of which one is needed, so reading
        // just "Customers" (1,601 rows) was paying for parsing Invoice
        // Items/Visits/Invoices/Collections/Van Loads too — measured at
        // ~149s of the ~151s total. `sheets` restricts XLSX.read to only the
        // sheet(s) named, skipping parse work for every other sheet entirely
        // (verified in xlsx@0.18.5 source: it's a `continue` before the
        // per-sheet parse call, not a post-parse filter). Includes 0 as a
        // fallback target to mirror the `?? workbook.SheetNames[0]` below in
        // case file.sheetIndex is ever missing/out of range.
        const rows = await serializeExcelParse(() => {
          const workbook = XLSX.read(buffer, {
            type: "buffer",
            cellDates: true,
            sheets: Array.from(new Set([file.sheetIndex, 0])),
          });
          const sheetName = workbook.SheetNames[file.sheetIndex] ?? workbook.SheetNames[0];
          const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
          return (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as DatasetRow[];
        });
        const tReadEnd = Date.now();
        const tJsonEnd = Date.now();
        this.logger.log(
          `[ParseTiming] entity=${entityName} file=${file.fileName} (${file.id}) bytes=${buffer.length} rows=${rows.length} ` +
            `download=${tDownloadEnd - tDownloadStart}ms xlsxRead=${tReadEnd - tDownloadEnd}ms sheetToJson=${tJsonEnd - tReadEnd}ms`,
        );

        const fileHeaders = rows.length > 0 ? Object.keys(rows[0] as object) : [];
        for (const h of fileHeaders) if (!headers.includes(h)) headers.push(h);

        // Resolve this file's actual header spelling for each official PK
        // column (case/spacing-tolerant, same normalizeHeader convention as
        // everywhere else). If any PK column is missing from this file,
        // dedupe is skipped for it — keep all rows rather than guess.
        let pkColumns: string[] | null = null;
        if (primaryKey && matchingFiles.length > 1) {
          const resolved = primaryKey.map((pk) => fileHeaders.find((h) => normalizeHeader(h) === normalizeHeader(pk)));
          pkColumns = resolved.every((c): c is string => !!c) ? (resolved as string[]) : null;
        }

        if (!pkColumns) {
          mergedRows = mergedRows.concat(rows);
          continue;
        }

        const thisFileKeys = new Set<string>();
        const keptRows: DatasetRow[] = [];
        for (const row of rows) {
          const keyParts = pkColumns.map((c) => String(row[c] ?? "").trim());
          if (keyParts.some((p) => p === "")) {
            keptRows.push(row); // incomplete key — can't dedupe, keep
            continue;
          }
          const key = keyParts.join("␟").toLowerCase();
          if (seenKeys.has(key)) continue; // a newer upload already has this row
          thisFileKeys.add(key);
          keptRows.push(row);
        }
        for (const k of thisFileKeys) seenKeys.add(k);
        mergedRows = mergedRows.concat(keptRows);
      } catch (err) {
        warnings.push(`Failed to read dataset "${file.fileName}" (${file.id}): ${(err as Error).message}`);
      }
    }

    return { mergedRows, headers, warnings };
  }

  // Sales Calendar (18th official Import Template, added 2026-07-19) is the
  // one Canonical Entity this provider serves out of a real Postgres table
  // (`sales_calendars`) instead of re-parsed Excel bytes: it's a dense,
  // frequently-queried date dimension other engines (SGI, Demand,
  // Forecasting, Executive Studio...) will hit constantly, unlike the
  // one-shot-report access pattern every other Excel-sourced Canonical
  // Entity has. Ingestion into `sales_calendars` happens elsewhere
  // (FilesService's confirmed-upload path); this method only reads.
  //
  // Sales Calendar has no RouteID (or any other per-rep/per-route scoping)
  // column at all — it's a flat date dimension — so hierarchy filtering is
  // still run for consistency with every other entity, but degrades to a
  // no-op exactly the way applyHierarchyFilter already does for any
  // RouteID-less dataset (see dataset-query.util.ts).
  private async getSalesCalendarRecords(options: EntityQueryOptions): Promise<EntityQueryResult> {
    const warnings: string[] = [];

    let rawRows;
    try {
      rawRows = await this.prisma.salesCalendar.findMany({ where: { companyId: options.companyId } });
    } catch (err) {
      this.logger.error(`Failed to read Sales Calendar for company ${options.companyId}: ${(err as Error).message}`);
      return {
        entityName: SALES_CALENDAR_ENTITY,
        available: false,
        unavailableReason: "PROVIDER_ERROR",
        records: [],
        fields: [],
        warnings: [`Provider error while reading Sales Calendar: ${(err as Error).message}`],
      };
    }

    if (rawRows.length === 0) {
      return {
        entityName: SALES_CALENDAR_ENTITY,
        available: false,
        unavailableReason: "NO_ACTIVE_DATASET",
        records: [],
        fields: [],
        warnings: ["No Sales Calendar rows are ingested for this company."],
      };
    }

    const headers = [...SALES_CALENDAR_FIELDS];

    let rows: DatasetRow[] = rawRows.map((row) => ({
      CalendarDate: row.calendarDate.toISOString().slice(0, 10),
      Day: row.day,
      Week: row.week,
      Month: row.month,
      Quarter: row.quarter,
      Year: row.year,
      WorkingDay: boolToYesNo(row.workingDay),
      Holiday: row.holiday,
      Season: row.season,
      Ramadan: boolToYesNo(row.ramadan),
      PromotionSeason: row.promotionSeason,
    }));

    // Same row-level hierarchy filter every other entity goes through — a
    // no-op here since Sales Calendar has no RouteID-aliased column
    // (applyHierarchyFilter returns rows unchanged when resolveColumnAlias
    // can't find one), kept for consistency rather than special-cased away.
    const routeAllowedValues = options.requestingUser
      ? await this.hierarchyResolver.resolveAllowedRouteIds(options.companyId, options.requestingUser)
      : null;
    rows = applyHierarchyFilter(rows, headers, routeAllowedValues);

    if (options.filters && options.filters.length > 0) {
      rows = rows.filter((row) => options.filters!.every((f) => matchesEntityFilter(row, headers, f)));
    }

    if (options.limit && rows.length > options.limit) {
      rows = rows.slice(0, options.limit);
    }

    return {
      entityName: SALES_CALENDAR_ENTITY,
      available: true,
      records: rows as readonly EntityRecord[],
      fields: headers,
      warnings,
    };
  }
}

// Lenient (header-normalized, case/spacing-insensitive) filter matcher —
// deliberately more forgiving than dataset-query.util's resolveExactColumn
// (which throws), because Navigation Engine needs to degrade gracefully
// (produce a warning) rather than crash when a Registry-documented column
// name doesn't literally match a given company's uploaded headers.
function matchesEntityFilter(row: DatasetRow, headers: string[], filter: EntityFieldFilter): boolean {
  const actualHeader = headers.find((h) => normalizeHeader(h) === normalizeHeader(filter.field)) ?? filter.field;
  const cell = row[actualHeader];

  switch (filter.op) {
    case "eq":
      return String(cell ?? "").trim().toLowerCase() === String(filter.value ?? "").trim().toLowerCase();
    case "in": {
      const set = new Set((filter.value as readonly unknown[]).map((v) => String(v).trim().toLowerCase()));
      return set.has(String(cell ?? "").trim().toLowerCase());
    }
    case "contains":
      return String(cell ?? "").toLowerCase().includes(String(filter.value ?? "").toLowerCase());
    case "gte":
    case "lte": {
      const cellNum = typeof cell === "number" ? cell : Date.parse(String(cell));
      const valNum = typeof filter.value === "number" ? filter.value : Date.parse(String(filter.value));
      if (Number.isNaN(cellNum) || Number.isNaN(valNum)) return false;
      return filter.op === "gte" ? cellNum >= valNum : cellNum <= valNum;
    }
    case "between": {
      const [lo, hi] = filter.value as [unknown, unknown];
      const cellNum = typeof cell === "number" ? cell : Date.parse(String(cell));
      const loNum = typeof lo === "number" ? lo : Date.parse(String(lo));
      const hiNum = typeof hi === "number" ? hi : Date.parse(String(hi));
      if (Number.isNaN(cellNum) || Number.isNaN(loNum) || Number.isNaN(hiNum)) return false;
      return cellNum >= loNum && cellNum <= hiNum;
    }
    default:
      return true;
  }
}
