import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as XLSX from "xlsx";
import { ROUTE_PLANNING_LIMITS, type RoutePlanningSplitInput } from "@field-sales-os/schemas";
import { FilesService } from "../files/files.service";
import { balancedRegionGrow, type LatLon } from "./route-balancer.util";

type SheetRow = Record<string, unknown>;

function readSheetRows(buffer: Buffer, sheetIndex: number): SheetRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[sheetIndex] ?? workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  return (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as SheetRow[];
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

@Injectable()
export class RoutePlanningService {
  constructor(private readonly filesService: FilesService) {}

  async listDistinctValues(companyId: string, fileId: string, column: string) {
    const file = await this.filesService.findActiveById(companyId, fileId);
    if (!file) throw new NotFoundException("Dataset not found");

    const buffer = await this.filesService.downloadFileBuffer(file.id, companyId);
    const rows = readSheetRows(buffer, file.sheetIndex);
    if (rows.length > 0 && !(column in rows[0]!)) {
      throw new BadRequestException(`Column "${column}" was not found in this dataset`);
    }

    const seen = new Set<string>();
    for (const row of rows) {
      const raw = row[column];
      if (raw === null || raw === undefined || raw === "") continue;
      seen.add(String(raw));
      if (seen.size >= ROUTE_PLANNING_LIMITS.maxDistinctValues) break;
    }
    return { values: Array.from(seen).sort((a, b) => a.localeCompare(b)) };
  }

  async split(companyId: string, input: RoutePlanningSplitInput) {
    const customerFile = await this.filesService.findActiveById(companyId, input.customerFileId);
    if (!customerFile) throw new NotFoundException("Customer dataset not found");

    const customerBuffer = await this.filesService.downloadFileBuffer(customerFile.id, companyId);
    const allRows = readSheetRows(customerBuffer, customerFile.sheetIndex);

    const requiredColumns = [input.latitudeColumn, input.longitudeColumn, input.idColumn, input.scopeColumn];
    if (allRows.length > 0) {
      for (const col of requiredColumns) {
        if (!(col in allRows[0]!)) throw new BadRequestException(`Column "${col}" was not found in the customer dataset`);
      }
    }

    const scoped = allRows.filter((row) => String(row[input.scopeColumn] ?? "") === input.scopeValue);
    if (scoped.length === 0) {
      throw new BadRequestException(`No rows match ${input.scopeColumn} = "${input.scopeValue}"`);
    }
    if (scoped.length > ROUTE_PLANNING_LIMITS.maxCustomersPerRequest) {
      throw new BadRequestException(
        `${scoped.length} customers match this scope, above the ${ROUTE_PLANNING_LIMITS.maxCustomersPerRequest}-customer limit for one split. Narrow the scope (e.g. split by territory instead of the whole company) and try again.`,
      );
    }

    // Sales value lookup: either read directly off the customer row, or
    // aggregate from a second file (e.g. Invoices) keyed by customer id.
    let salesById: Map<string, number> | null = null;
    if (input.salesFileId && input.salesFileCustomerIdColumn && input.salesFileAmountColumn) {
      const salesFile = await this.filesService.findActiveById(companyId, input.salesFileId);
      if (!salesFile) throw new NotFoundException("Sales dataset not found");
      const salesBuffer = await this.filesService.downloadFileBuffer(salesFile.id, companyId);
      const salesRows = readSheetRows(salesBuffer, salesFile.sheetIndex);
      salesById = new Map();
      for (const row of salesRows) {
        const id = String(row[input.salesFileCustomerIdColumn] ?? "");
        if (!id) continue;
        const amount = toFiniteNumber(row[input.salesFileAmountColumn]) ?? 0;
        salesById.set(id, (salesById.get(id) ?? 0) + amount);
      }
    }

    const records: {
      id: string;
      label: string;
      lat: number;
      lon: number;
      sales: number;
    }[] = [];
    let excludedBadCoordinates = 0;

    for (const row of scoped) {
      const lat = toFiniteNumber(row[input.latitudeColumn]);
      const lon = toFiniteNumber(row[input.longitudeColumn]);
      if (lat === null || lon === null || !isSaneCoordinate(lat, lon)) {
        excludedBadCoordinates++;
        continue;
      }
      const id = String(row[input.idColumn] ?? "");
      const label = input.labelColumn ? String(row[input.labelColumn] ?? id) : id;
      const sales = salesById ? (salesById.get(id) ?? 0) : (toFiniteNumber(row[input.salesColumn ?? ""]) ?? 0);
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
      scopeColumn: input.scopeColumn,
      scopeValue: input.scopeValue,
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
