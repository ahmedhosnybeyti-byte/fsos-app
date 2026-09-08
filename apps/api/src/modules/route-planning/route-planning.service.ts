import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as XLSX from "xlsx";
import { ROUTE_PLANNING_LIMITS, type RoutePlanningRieSplitInput, type RoutePlanningScopeField, type RoutePlanningValuesResult } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { applyHierarchyFilter } from "../files/dataset-query.util";
import { FilesService } from "../files/files.service";
import { RieFacade } from "../rie/rie-facade.service";
import { CanonicalHierarchyResolverService } from "../rie/canonical-hierarchy-resolver.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";
import { balancedRegionGrow, type LatLon } from "./route-balancer.util";
import { serializeExcelParse } from "../../common/excel-parse-queue";

type SheetRow = Record<string, unknown>;

async function readSheetRows(buffer: Buffer, sheetIndex: number): Promise<SheetRow[]> {
  // 2026-07-20: restrict XLSX.read to the one needed sheet — see the same
  // fix (and its full explanation) in ExcelDatasetEntityProvider.parseDatasetFromFiles.
  // Otherwise every call pays for parsing the entire (potentially
  // multi-sheet batch, tens of MB) workbook just to read one sheet.
  return serializeExcelParse(() => {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, sheets: Array.from(new Set([sheetIndex, 0])) });
    const sheetName = workbook.SheetNames[sheetIndex] ?? workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    return (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as SheetRow[];
  });
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Saudi-Arabia-sane bounds — generous enough to not be region-specific in
// spirit, but this whole feature only makes sense for one company's own
// operating area, and real uploads have shown occasional garbage rows
// (e.g. lat=0/lon=0, or a stray unit-conversion error) that would otherwise
// silently wreck the k-means seed. See PROJECT_LOG.md.
function isSaneCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

// Migration #4 (ADR-001 / RIE Migration Plan, 2026-07-17) — split() now
// reads via RieFacade (Customers/Invoices/Invoice Items), no file/column
// mapping. listDistinctValues()/visibleRows() below are UNCHANGED and kept:
// New Customer / Geo Intelligence (not yet migrated) still depends on GET
// /route-planning/distinct-values for its own arbitrary uploaded-file
// column dropdowns, so FilesService stays a dependency of this module.
@Injectable()
export class RoutePlanningService {
  constructor(
    private readonly filesService: FilesService,
    private readonly rieFacade: RieFacade,
    private readonly hierarchyResolver: CanonicalHierarchyResolverService,
  ) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  private assertAvailable(result: EntityQueryResult, arabicLabel: string): void {
    if (!result.available) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  // Route-based hierarchy resolution (Task #138), rewired post-ADR-001 —
  // resolved via the Canonical Routes/Employees Datasets (same as every
  // other reader) rather than this file's old manual config. See
  // heatmap.service.ts's identical helper. Still backs the legacy
  // listDistinctValues() below.
  private async visibleRows(rows: SheetRow[], headers: string[], companyId: string, user: AuthenticatedUser) {
    const hierarchyUser = { roleCode: user.roleCode, email: user.email };
    const routeAllowed = await this.hierarchyResolver.resolveAllowedRouteIds(companyId, hierarchyUser);
    return applyHierarchyFilter(rows, headers, routeAllowed);
  }

  // UNCHANGED — legacy file+column dropdown, still used by New Customer /
  // Geo Intelligence (not yet migrated). Do not touch.
  async listDistinctValues(user: AuthenticatedUser, fileId: string, column: string) {
    const companyId = user.companyId!;
    const file = await this.filesService.findActiveById(companyId, fileId);
    if (!file) throw new NotFoundException("Dataset not found");

    const buffer = await this.filesService.downloadFileBuffer(file.id, companyId);
    const allRows = await readSheetRows(buffer, file.sheetIndex);
    if (allRows.length > 0 && !(column in allRows[0]!)) {
      throw new BadRequestException(`Column "${column}" was not found in this dataset`);
    }
    // Row-level access control (strategic point 3) — a restricted role must
    // not be able to discover scope values (e.g. other reps' territory
    // codes) beyond their own rows via this dropdown-population endpoint.
    const rows = await this.visibleRows(allRows, allRows.length > 0 ? Object.keys(allRows[0]!) : [], companyId, user);

    const seen = new Set<string>();
    for (const row of rows) {
      const raw = row[column];
      if (raw === null || raw === undefined || raw === "") continue;
      seen.add(String(raw));
      if (seen.size >= ROUTE_PLANNING_LIMITS.maxDistinctValues) break;
    }
    return { values: Array.from(seen).sort((a, b) => a.localeCompare(b)) };
  }

  // RIE-backed dedicated dropdown endpoint for this screen's own scope
  // field — same pattern as Migrations #2/#3's scope-values endpoints.
  async scopeValues(user: AuthenticatedUser, scopeField: RoutePlanningScopeField): Promise<RoutePlanningValuesResult> {
    const customersResult = await this.rieFacade.getEntityRecords("Customers", this.rieContext(user));
    this.assertAvailable(customersResult, "العملاء");
    const values = new Set<string>();
    for (const row of customersResult.records) {
      const v = String(row[scopeField] ?? "").trim();
      if (v) values.add(v);
    }
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }

  // Sales value per selected customer. The Invoice Items -> Invoices join,
  // CustomerCode scope, and LineTotal sum stay in PostgreSQL; Node receives
  // only the at-most-one final aggregate row per customer used in this split.
  private async computeSalesByCustomer(ctx: ReturnType<RoutePlanningService["rieContext"]>, customerCodes: readonly string[]): Promise<Map<string, number>> {
    if (customerCodes.length === 0) return new Map();
    if (!await this.rieFacade.hasCanonicalEntitySources(ctx, ["Invoices"])) {
      throw new NotFoundException('بيانات "الفواتير" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.');
    }
    if (!await this.rieFacade.hasCanonicalEntitySources(ctx, ["Invoice Items"])) {
      throw new NotFoundException('بيانات "أصناف الفاتورة" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.');
    }

    const allowedRoutes = await this.hierarchyResolver.resolveAllowedRouteIds(ctx.companyId, ctx.requestingUser);
    const routeScopes = allowedRoutes === null
      ? []
      : [
          { field: "RouteID", source: "base", values: [...allowedRoutes] },
          { field: "RouteID", source: "invoice", values: [...allowedRoutes] },
        ];
    const result = await this.rieFacade.queryCanonicalRecords({
      ...ctx,
      entityName: "Invoice Items",
      projection: [{ field: "CustomerCode", source: "invoice", as: "customerCode" }],
      joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }],
      scope: {
        customer: { source: "invoice", values: customerCodes },
        ...(routeScopes.length ? { fields: routeScopes } : {}),
      },
      hierarchyRoute: { field: "RouteID", source: "base" },
      groupBy: [{ field: "CustomerCode", source: "invoice" }],
      aggregates: [{ op: "sum", field: "LineTotal", as: "sales" }],
      // This is a bounded final aggregate: the caller already limits the
      // selected-customer scope to Route Planning's 5,000-customer maximum.
      unboundedFinalResult: true,
    });
    return new Map(result.records.map((row) => [String(row.customerCode ?? "").trim(), toFiniteNumber(row.sales) ?? 0]));
  }

  async split(user: AuthenticatedUser, input: RoutePlanningRieSplitInput) {
    const ctx = this.rieContext(user);
    const customersResult = await this.rieFacade.getEntityRecords("Customers", ctx);
    this.assertAvailable(customersResult, "العملاء");

    const { scopeField, scopeValues } = input;
    const scopeValueSet = new Set(scopeValues);
    const scoped = customersResult.records.filter((row) => scopeValueSet.has(String(row[scopeField] ?? "")));
    if (scoped.length === 0) {
      throw new BadRequestException(`No rows match ${scopeField} in [${scopeValues.join(", ")}]`);
    }
    if (scoped.length > ROUTE_PLANNING_LIMITS.maxCustomersPerRequest) {
      throw new BadRequestException(
        `${scoped.length} customers match this scope, above the ${ROUTE_PLANNING_LIMITS.maxCustomersPerRequest}-customer limit for one split. Narrow the scope (e.g. split by territory instead of the whole company) and try again.`,
      );
    }

    const customerCodes = [...new Set(scoped.map((row) => String(row.CustomerCode ?? "").trim()).filter(Boolean))];
    const salesById = await this.computeSalesByCustomer(ctx, customerCodes);

    const records: {
      id: string;
      label: string;
      lat: number;
      lon: number;
      sales: number;
    }[] = [];
    let excludedBadCoordinates = 0;

    for (const row of scoped) {
      const lat = toFiniteNumber(row.Latitude);
      const lon = toFiniteNumber(row.Longitude);
      if (lat === null || lon === null || !isSaneCoordinate(lat, lon)) {
        excludedBadCoordinates++;
        continue;
      }
      const id = String(row.CustomerCode ?? "").trim();
      const label = String(row.CustomerName ?? id);
      const sales = salesById.get(id) ?? 0;
      records.push({ id, label, lat, lon, sales });
    }

    if (records.length < input.groupCount) {
      throw new BadRequestException(
        `Only ${records.length} customers have usable coordinates for this scope — not enough to form ${input.groupCount} groups.`,
      );
    }

    const points: LatLon[] = records.map((r) => ({ lat: r.lat, lon: r.lon }));
    const values = records.map((r) => r.sales);

    const result = balancedRegionGrow({
      points,
      values,
      groupCount: input.groupCount,
      tolerance: input.tolerance,
    });

    const beforeCounts: number[] = new Array(input.groupCount).fill(0);
    const afterCounts: number[] = new Array(input.groupCount).fill(0);
    for (const g of result.before) beforeCounts[g] = (beforeCounts[g] ?? 0) + 1;
    for (const g of result.after) afterCounts[g] = (afterCounts[g] ?? 0) + 1;

    return {
      // Kept as "scopeColumn" in the output shape (not renamed to
      // scopeField) — RouteSplitMap/Customer Similarity's adapter and the
      // Excel export both consume this result shape unchanged; only the
      // request contract changed.
      scopeColumn: input.scopeField,
      scopeValues: input.scopeValues,
      groupCount: input.groupCount,
      target: result.target,
      excludedBadCoordinates,
      totalScopedRows: scoped.length,
      usedRows: records.length,
      beforeTotals: result.beforeTotals,
      afterTotals: result.afterTotals,
      beforeCounts,
      afterCounts,
      records: records.map((r, i) => ({
        id: r.id,
        label: r.label,
        lat: r.lat,
        lon: r.lon,
        sales: r.sales,
        before: result.before[i],
        after: result.after[i],
      })),
    };
  }
}
