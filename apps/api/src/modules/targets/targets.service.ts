import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as XLSX from "xlsx";
import {
  type ImportTargetsFromFileInput,
  type ImportTargetsResult,
  type ListTargetsQuery,
  type TargetRecord,
  type UpsertTargetsBatchInput,
} from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { applyHierarchyFilter } from "../files/dataset-query.util";
import { FilesService } from "../files/files.service";
import { CanonicalHierarchyResolverService } from "../rie/canonical-hierarchy-resolver.service";

type SheetRow = Record<string, unknown>;

function readSheetRows(buffer: Buffer, sheetIndex: number): SheetRow[] {
  // 2026-07-20: restrict XLSX.read to the one needed sheet — see the same
  // fix (and its full explanation) in ExcelDatasetEntityProvider.parseDatasetFromFiles.
  // Otherwise every call pays for parsing the entire (potentially
  // multi-sheet batch, tens of MB) workbook just to read one sheet.
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, sheets: Array.from(new Set([sheetIndex, 0])) });
  const sheetName = workbook.SheetNames[sheetIndex] ?? workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  return (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as SheetRow[];
}

// Accepts "2026-07", a Date, or an Excel-style numeric/string date and
// normalizes to "YYYY-MM" — uploaded Targets files are just as likely to
// have a real date column as a plain "2026-07" text column, same
// tolerance every other file-reading module in this app already has.
function toPeriodMonth(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Prisma's Decimal (decimal.js under the hood) has a documented
// `.toNumber()` — used explicitly rather than relying on implicit
// `Number(decimalInstance)` coercion behavior.
function decimalToNumber(value: unknown): number {
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: unknown }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

function toTargetRecord(row: {
  id: string;
  repOrTerritoryKey: string;
  periodMonth: string;
  value: unknown; // Prisma.Decimal
  source: string;
  createdByUserId: string | null;
  sourceFileId: string | null;
  updatedAt: Date;
}): TargetRecord {
  return {
    id: row.id,
    repOrTerritoryKey: row.repOrTerritoryKey,
    periodMonth: row.periodMonth,
    value: decimalToNumber(row.value),
    source: row.source as TargetRecord["source"],
    createdByUserId: row.createdByUserId,
    sourceFileId: row.sourceFileId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class TargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly hierarchyResolver: CanonicalHierarchyResolverService,
  ) {}

  // Visibility: MANAGER/COMPANY_ADMIN/SUPER_ADMIN see every target in the
  // company (same tier that's unrestricted everywhere else via
  // applyHierarchyFilter). A SALES_REP only sees their own row
  // (repOrTerritoryKey matched against their own email). SUPERVISOR is
  // deliberately treated as unrestricted here for now — this table has a
  // single free-text key rather than distinct rep/supervisor columns, so
  // there's no per-supervisor team mapping to filter by yet; this is a
  // known simplification (not a regression — nothing here was previously
  // more restricted), flagged for a real fix once territory/team
  // structure exists as its own concept.
  async list(user: AuthenticatedUser, query: ListTargetsQuery): Promise<TargetRecord[]> {
    if (!user.companyId) throw new ForbiddenException();

    const where: { companyId: string; periodMonth?: string; repOrTerritoryKey?: { equals: string; mode: "insensitive" } } = {
      companyId: user.companyId,
    };
    if (query.periodMonth) where.periodMonth = query.periodMonth;
    if (user.roleCode === "SALES_REP") where.repOrTerritoryKey = { equals: user.email, mode: "insensitive" };

    const rows = await this.prisma.target.findMany({ where, orderBy: [{ periodMonth: "desc" }, { repOrTerritoryKey: "asc" }] });
    return rows.map(toTargetRecord);
  }

  async upsertMany(user: AuthenticatedUser, input: UpsertTargetsBatchInput): Promise<TargetRecord[]> {
    if (!user.companyId) throw new ForbiddenException();

    const results = await this.prisma.$transaction(
      input.targets.map((t) =>
        this.prisma.target.upsert({
          where: { companyId_repOrTerritoryKey_periodMonth: { companyId: user.companyId!, repOrTerritoryKey: t.repOrTerritoryKey, periodMonth: t.periodMonth } },
          create: {
            companyId: user.companyId!,
            repOrTerritoryKey: t.repOrTerritoryKey,
            periodMonth: t.periodMonth,
            value: t.value,
            source: "MANUAL",
            createdByUserId: user.userId,
            sourceFileId: null,
          },
          update: {
            value: t.value,
            source: "MANUAL",
            createdByUserId: user.userId,
            sourceFileId: null,
          },
        }),
      ),
    );
    return results.map(toTargetRecord);
  }

  async importFromFile(user: AuthenticatedUser, input: ImportTargetsFromFileInput): Promise<ImportTargetsResult> {
    if (!user.companyId) throw new ForbiddenException();
    const companyId = user.companyId;

    const file = await this.filesService.findActiveById(companyId, input.fileId);
    if (!file) throw new NotFoundException("Targets dataset not found");
    const buffer = await this.filesService.downloadFileBuffer(file.id, companyId);
    const rawRows = readSheetRows(buffer, file.sheetIndex);

    const requiredCols = [input.repOrTerritoryColumn, input.periodMonthColumn, input.valueColumn];
    if (rawRows.length > 0) {
      for (const col of requiredCols) {
        if (!(col in rawRows[0]!)) throw new BadRequestException(`Column "${col}" was not found in the targets dataset`);
      }
    }
    const hierarchyUser = { roleCode: user.roleCode, email: user.email };
    const routeAllowed = await this.hierarchyResolver.resolveAllowedRouteIds(companyId, hierarchyUser);
    const rows = applyHierarchyFilter(rawRows, rawRows.length > 0 ? Object.keys(rawRows[0]!) : [], routeAllowed);

    let importedCount = 0;
    let skippedInvalidRows = 0;
    const upserts: Array<{ repOrTerritoryKey: string; periodMonth: string; value: number }> = [];

    for (const row of rows) {
      const repOrTerritoryKey = String(row[input.repOrTerritoryColumn] ?? "").trim();
      const periodMonth = toPeriodMonth(row[input.periodMonthColumn]);
      const value = toFiniteNumber(row[input.valueColumn]);
      if (!repOrTerritoryKey || !periodMonth || value === null || value < 0) {
        skippedInvalidRows += 1;
        continue;
      }
      upserts.push({ repOrTerritoryKey, periodMonth, value });
    }

    if (upserts.length > 0) {
      await this.prisma.$transaction(
        upserts.map((t) =>
          this.prisma.target.upsert({
            where: { companyId_repOrTerritoryKey_periodMonth: { companyId, repOrTerritoryKey: t.repOrTerritoryKey, periodMonth: t.periodMonth } },
            create: {
              companyId,
              repOrTerritoryKey: t.repOrTerritoryKey,
              periodMonth: t.periodMonth,
              value: t.value,
              source: "UPLOAD",
              createdByUserId: null,
              sourceFileId: file.id,
            },
            update: {
              value: t.value,
              source: "UPLOAD",
              sourceFileId: file.id,
            },
          }),
        ),
      );
      importedCount = upserts.length;
    }

    return { importedCount, skippedInvalidRows };
  }
}
