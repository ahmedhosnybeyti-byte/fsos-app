import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import * as argon2 from "argon2";
import * as XLSX from "xlsx";
import type { File, Gpt } from "@field-sales-os/database";
import {
  TOKEN_TTL,
  type AggregateSpec,
  type ConfigureGptInput,
  type FilterOperatorSpec,
  type GetGptDatasetInput,
  type RenderAnalysisEventInput,
} from "@field-sales-os/schemas";
import { PrismaService, isUniqueConstraintError } from "../../common/prisma";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { FilesService } from "../files/files.service";
import { UsageAnalyticsService } from "../usage-analytics/usage-analytics.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AnalysisEventService } from "../analysis-studio/analysis-event.service";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";

function hashLaunchCode(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

interface ApiKeyParts {
  keyId: string;
  secret: string;
}

function parseApiKey(raw: string): ApiKeyParts | null {
  const idx = raw.indexOf(".");
  if (idx <= 0 || idx === raw.length - 1) return null;
  return { keyId: raw.slice(0, idx), secret: raw.slice(idx + 1) };
}

// Mirrors ColumnMetadata/DetectedMetadata in
// modules/files/classification/types.ts — kept as a separate, looser type
// here (rather than importing those) because parsedMetadata is untyped JSON
// on the File row by the time it reaches this service, same as
// DatasetSummary's other fields.
interface ColumnSummary {
  name: string;
  type: "numeric" | "date" | "boolean" | "text" | "empty";
  nullable: boolean;
  min?: number | string;
  max?: number | string;
  distinctValues?: string[];
}

interface DetectedSummary {
  period?: { from: string; to: string };
  region?: string[];
  branch?: string[];
  salesRep?: string[];
  route?: string[];
}

interface DatasetSummary {
  id: string;
  datasetType: string;
  fileName: string;
  rowCount: number | null;
  headers: string[] | null;
  // Metadata Layer (Sprint 2.2) — additive: absent on files uploaded before
  // this existed (their parsedMetadata predates these fields), present on
  // everything parsed since. Lets Stage 3/4 of the reasoning pipeline
  // (metadata inspection, column resolution) work from real column
  // types/values instead of header names alone, with zero extra calls.
  columns: ColumnSummary[] | null;
  detected: DetectedSummary | null;
}

// Lightweight metadata the model uses to decide which dataset(s) are
// relevant to a question — never the full row data (that's a separate
// getDataset call per fileId, since row data can be large).
function toDatasetSummary(file: Pick<File, "id" | "datasetType" | "fileName" | "parsedMetadata">): DatasetSummary {
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

// ---- getDataset filtering ---------------------------------------------
// Uploaded workbooks have no fixed column schema (a company's "customer
// id" column might be CustomerCode, Customer ID, custcode, ...), so the
// named shortcuts below are resolved against each dataset's real headers
// at request time rather than assumed to exist.
type DatasetRow = Record<string, unknown>;

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const COLUMN_ALIASES: Record<"customerId" | "invoiceId" | "routeId" | "salesRep", string[]> = {
  customerId: ["customercode", "customerid", "custcode", "custid", "clientcode", "clientid"],
  invoiceId: ["invoiceno", "invoiceid", "invoicenumber", "invno"],
  routeId: ["routeid", "routecode", "routeno", "route"],
  salesRep: ["salesrep", "rep", "repname", "salesrepname", "repcode"],
};

// Finds the real header name (original casing) matching one of the given
// filter's known aliases, or null if this dataset has no such column.
function resolveColumnAlias(headers: string[], filterName: keyof typeof COLUMN_ALIASES): string | null {
  const aliasSet = new Set(COLUMN_ALIASES[filterName]);
  return headers.find((h) => aliasSet.has(normalizeHeader(h))) ?? null;
}

function valuesMatch(cellValue: unknown, expected: string): boolean {
  if (cellValue === null || cellValue === undefined) return false;
  return String(cellValue).trim().toLowerCase() === expected.trim().toLowerCase();
}

// Sprint 2.3 — Rich Filter Operators. Cell values come from XLSX parsed
// with cellDates:true, so a date cell is already a JS Date; a string spec
// bound (dateFrom/dateTo, already validated as parseable by the schema)
// still needs parsing here.
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// One column's operator spec against one cell — every key present on the
// spec must pass (AND), same as filters already ANDs across columns. A cell
// that can't be read as the operator's type (not a date, not a number, not
// present) fails the condition rather than being silently skipped, so an
// operator filter never accidentally widens into "match everything".
function matchesFilterOperatorSpec(cellValue: unknown, spec: FilterOperatorSpec): boolean {
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

interface DatasetQueryFilters {
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
// Node before pagination/aggregation (same architecture as Sprint 2.1's
// aggregate) — there is no row-level Postgres store to push this into.
function filterRows(rows: DatasetRow[], headers: string[], query: DatasetQueryFilters): DatasetRow[] {
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

// ---- getDataset aggregation ---------------------------------------------
// Purely mechanical: the caller (the model) supplies op + column explicitly,
// same as SUM()/COUNT() in a spreadsheet — the backend never infers what a
// number means or decides to aggregate on its own.

function resolveExactColumn(headers: string[], name: string): string {
  const column = headers.find((h) => h.toLowerCase() === name.toLowerCase());
  if (!column) {
    throw new BadRequestException(`Column "${name}" was not found in this dataset. Available columns: ${headers.join(", ")}.`);
  }
  return column;
}

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface AggregateResult {
  value: number;
  rowsAggregated: number;
  skippedNonNumericRows: number;
}

// Non-numeric/blank cells are skipped rather than treated as errors or
// zeros — same behavior a spreadsheet's SUM/AVERAGE gives on mixed columns
// — but the count is reported so the model can be honest about it rather
// than silently presenting a figure that quietly ignored bad data.
function computeAggregate(op: AggregateSpec["op"], rows: DatasetRow[], column: string | undefined): AggregateResult {
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

// ---- getDataset sorting & projection (Sprint 2.4) ------------------------
// Both execute server-side, after filtering and before pagination — same
// place aggregate already ran (Sprint 2.1) — and are purely presentational:
// neither changes which rows match, only how the result set is ordered or
// which fields of it come back.

type SortDir = "asc" | "desc";

// Numeric or date compare when both sides parse as that type (reusing the
// same coercion filters/aggregate already use, so a column sorts the same
// way it filters), otherwise a case-insensitive natural string compare —
// this is what makes sorting work uniformly across text/numeric/date
// columns without the caller declaring the column's type up front.
function compareValues(a: unknown, b: unknown): number {
  const an = toNumeric(a);
  const bn = toNumeric(b);
  if (an !== null && bn !== null) return an - bn;

  const ad = toDate(a);
  const bd = toDate(b);
  if (ad !== null && bd !== null) return ad.getTime() - bd.getTime();

  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

// Blank cells always sort last, in either direction — a common convention
// (and avoids "ascending" surfacing every blank row first). Ties preserve
// original relative order (stable).
function sortRows(rows: DatasetRow[], column: string, dir: SortDir): DatasetRow[] {
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

// Resolves every requested projection name against this dataset's real
// headers up front (case-insensitive, same as resolveExactColumn) so a
// typo'd column name always fails clearly, in rows or aggregate mode alike
// — even though projection itself only applies to a rows-mode response.
function resolveColumns(headers: string[], names: string[]): string[] {
  return names.map((name) => resolveExactColumn(headers, name));
}

function projectRow(row: DatasetRow, columns: string[]): DatasetRow {
  const projected: DatasetRow = {};
  for (const column of columns) projected[column] = row[column];
  return projected;
}

// The only "columns" that exist on a grouped-aggregate result — distinct
// from the dataset's own headers, so sortBy is validated against this fixed
// set instead of resolveExactColumn when groupBy is active.
const GROUP_SORT_FIELDS = ["groupValue", "value", "rowCount"] as const;
type GroupSortField = (typeof GROUP_SORT_FIELDS)[number];

function resolveGroupSortField(sortBy: string): GroupSortField {
  const match = GROUP_SORT_FIELDS.find((f) => f.toLowerCase() === sortBy.toLowerCase());
  if (!match) {
    throw new BadRequestException(`sortBy "${sortBy}" is not valid when grouping — use one of: ${GROUP_SORT_FIELDS.join(", ")}.`);
  }
  return match;
}

function sortGroups<T extends { groupValue: string; rowCount: number; value: number }>(groups: T[], field: GroupSortField, dir: SortDir): T[] {
  return [...groups].sort((a, b) => {
    const cmp = field === "groupValue" ? String(a[field]).localeCompare(String(b[field]), undefined, { sensitivity: "base", numeric: true }) : a[field] - b[field];
    return dir === "desc" ? -cmp : cmp;
  });
}

// This service is the entire "the ChatGPT link must never be freely usable"
// requirement made concrete. Two independent secrets gate every Action call:
//   1. A static, per-company API key (Bearer, configured once in the GPT
//      Builder's Action auth settings) — proves the call comes from that
//      company's GPT, not someone who copy-pasted the OpenAPI schema.
//   2. A short-lived launch code the user fetches from their dashboard (only
//      reachable while their company's subscription is active) and pastes
//      into the chat — proves a real, currently-authorized session started
//      this specific conversation. On success it's promoted into a
//      longer-lived session token the model carries forward for /gpt/dataset.
@Injectable()
export class GptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly filesService: FilesService,
    private readonly usageAnalyticsService: UsageAnalyticsService,
    private readonly auditLogService: AuditLogService,
    private readonly analysisEventService: AnalysisEventService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  // ---- Company-admin session-auth management -----------------------------

  findByCompany(companyId: string) {
    return this.prisma.gpt.findUnique({
      where: { companyId },
      select: {
        id: true,
        companyId: true,
        name: true,
        apiKeyId: true,
        dnaConfig: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async configure(companyId: string, dto: ConfigureGptInput): Promise<Gpt | { apiKey: string; note: string }> {
    const existing = await this.prisma.gpt.findUnique({ where: { companyId } });
    if (existing) {
      return this.prisma.gpt.update({
        where: { companyId },
        data: { name: dto.name },
      });
    }

    const { apiKeyId, secret, hash } = await this.generateApiKey();
    try {
      await this.prisma.gpt.create({
        data: {
          companyId,
          name: dto.name,
          apiKeyId,
          apiKeySecretHash: hash,
        },
      });
    } catch (err) {
      if (isUniqueConstraintError(err, "api_key_id")) {
        // astronomically unlikely with 24 random bytes, but retry once rather
        // than fail the whole configure call outright
        return this.configure(companyId, dto);
      }
      throw err;
    }

    return { apiKey: `${apiKeyId}.${secret}`, note: "Store this API key now — it will not be shown again." };
  }

  async regenerateApiKey(companyId: string) {
    const gpt = await this.prisma.gpt.findUnique({ where: { companyId } });
    if (!gpt) throw new NotFoundException("Configure your GPT before generating an API key");

    const { apiKeyId, secret, hash } = await this.generateApiKey();
    await this.prisma.gpt.update({
      where: { companyId },
      data: { apiKeyId, apiKeySecretHash: hash },
    });

    await this.auditLogService.record({ companyId, action: "gpt.regenerate_key", entityType: "Gpt", entityId: gpt.id });

    return { apiKey: `${apiKeyId}.${secret}`, note: "Store this API key now — it will not be shown again." };
  }

  private async generateApiKey() {
    const apiKeyId = `fso_${randomBytes(8).toString("hex")}`;
    const secret = randomBytes(24).toString("base64url");
    const hash = await argon2.hash(secret);
    return { apiKeyId, secret, hash };
  }

  // ---- User-facing launch flow (session-auth) -----------------------------

  async mintLaunchCode(userId: string, companyId: string) {
    const gpt = await this.prisma.gpt.findUnique({ where: { companyId } });
    if (!gpt || !gpt.isActive) {
      throw new NotFoundException("Your company has not configured a Custom GPT yet");
    }

    const raw = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_TTL.gptLaunchTokenMinutes * 60 * 1000);

    await this.prisma.gptLaunchToken.create({
      data: {
        userId,
        companyId,
        gptId: gpt.id,
        tokenHash: hashLaunchCode(raw),
        expiresAt,
      },
    });

    await this.usageAnalyticsService.recordEvent({ companyId, userId, gptId: gpt.id, eventType: "LAUNCH_TOKEN_ISSUED" });

    // Always the platform's configured base URL — never a conversation URL.
    // ChatGPT appends /c/<id> to the address bar once a chat starts; that's
    // the browser's doing, not something we construct or persist here.
    const { gptBaseUrl } = await this.platformSettingsService.get();

    return { launchCode: raw, gptUrl: gptBaseUrl, expiresInMinutes: TOKEN_TTL.gptLaunchTokenMinutes };
  }

  // ---- GPT Action endpoints (company API-key auth, not user session) -----

  private async resolveCompanyByApiKey(rawApiKey: string) {
    const parts = parseApiKey(rawApiKey);
    if (!parts) throw new UnauthorizedException("Malformed API key");

    const gpt = await this.prisma.gpt.findUnique({ where: { apiKeyId: parts.keyId } });
    if (!gpt || !gpt.isActive) throw new UnauthorizedException("Invalid API key");

    const valid = await argon2.verify(gpt.apiKeySecretHash, parts.secret);
    if (!valid) throw new UnauthorizedException("Invalid API key");

    return gpt;
  }

  async verifyAccess(rawApiKey: string, rawLaunchCode: string) {
    const gpt = await this.resolveCompanyByApiKey(rawApiKey);

    const isActive = await this.subscriptionsService.isCompanyActive(gpt.companyId);
    if (!isActive) {
      throw new ForbiddenException("This company's subscription is not active. Access denied.");
    }

    const tokenHash = hashLaunchCode(rawLaunchCode);
    const launchToken = await this.prisma.gptLaunchToken.findUnique({ where: { tokenHash } });

    if (!launchToken || launchToken.companyId !== gpt.companyId) {
      throw new UnauthorizedException("Invalid access code");
    }
    if (launchToken.usedAt) {
      throw new UnauthorizedException("This access code has already been used");
    }
    if (launchToken.expiresAt < new Date()) {
      throw new UnauthorizedException("This access code has expired");
    }

    // Promote the one-time code into a session token valid for the rest of
    // the conversation — the model is instructed to pass it back on every
    // subsequent /gpt/dataset call.
    const sessionExpiresAt = new Date(Date.now() + TOKEN_TTL.gptSessionHours * 60 * 60 * 1000);
    await this.prisma.gptLaunchToken.update({
      where: { id: launchToken.id },
      data: { usedAt: new Date(), expiresAt: sessionExpiresAt },
    });

    await this.usageAnalyticsService.recordEvent({
      companyId: gpt.companyId,
      userId: launchToken.userId,
      gptId: gpt.id,
      eventType: "VERIFY_ACCESS",
    });

    // The model receives every active, CONFIRMED dataset's metadata right
    // away — no more guessing based on a fixed set of file "types"; it
    // decides which dataset(s) matter based on the user's actual question.
    // Files still awaiting classification confirmation are withheld: the
    // AI should never analyze a dataset the platform hasn't finished
    // labeling correctly.
    const activeFiles = await this.filesService.listConfirmedActiveForCompany(gpt.companyId);

    return {
      sessionToken: rawLaunchCode,
      companyName: (await this.prisma.company.findUnique({ where: { id: gpt.companyId } }))?.name,
      datasets: activeFiles.map(toDatasetSummary),
      sessionExpiresInHours: TOKEN_TTL.gptSessionHours,
    };
  }

  // GET /gpt/datasets — lets the model re-list active datasets mid-
  // conversation (e.g. if the user mentions a dataset uploaded after
  // verify-access ran) without needing to re-verify access.
  async listDatasets(rawApiKey: string, sessionToken: string): Promise<DatasetSummary[]> {
    const { gpt } = await this.assertValidSession(rawApiKey, sessionToken);
    const activeFiles = await this.filesService.listConfirmedActiveForCompany(gpt.companyId);
    return activeFiles.map(toDatasetSummary);
  }

  // Called by the scheduled expiry job: instantly invalidates every
  // outstanding launch code / active session for a company the moment its
  // subscription lapses, so an in-progress GPT conversation can't keep
  // calling /gpt/dataset past expiry.
  async revokeAllSessionsForCompany(companyId: string): Promise<void> {
    await this.prisma.gptLaunchToken.updateMany({
      where: { companyId, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
  }

  private async assertValidSession(rawApiKey: string, sessionToken: string) {
    const gpt = await this.resolveCompanyByApiKey(rawApiKey);

    const isActive = await this.subscriptionsService.isCompanyActive(gpt.companyId);
    if (!isActive) {
      throw new ForbiddenException("This company's subscription is not active. Access denied.");
    }

    const tokenHash = hashLaunchCode(sessionToken);
    const session = await this.prisma.gptLaunchToken.findUnique({ where: { tokenHash } });

    if (!session || session.companyId !== gpt.companyId || !session.usedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired session. Please verify access again.");
    }

    return { gpt, session };
  }

  // Returns a filtered, paginated slice of one dataset — never the whole
  // file. See filterRows() for how customerId/invoiceId/routeId/salesRep/
  // search/filters combine (AND semantics); limit/offset then page the
  // result. This is the fix for ChatGPT's ResponseTooLargeError, which
  // happened here when the endpoint used to return every row unconditionally.
  //
  // `aggregate` (added Sprint 2.1) is additive: absent, behavior and
  // response shape are byte-for-byte what they were before it existed. When
  // present, rows are never returned at all — only the computed figure(s) —
  // since the whole point is avoiding the token cost of raw rows when only
  // a number was asked for.
  async getDataset(rawApiKey: string, sessionToken: string, query: GetGptDatasetInput) {
    const { gpt, session } = await this.assertValidSession(rawApiKey, sessionToken);

    const file = await this.filesService.findActiveById(gpt.companyId, query.fileId);
    if (!file) {
      throw new NotFoundException("Dataset not found — it may have been removed. Call GET /gpt/datasets to see what's currently active.");
    }

    const buffer = await this.filesService.downloadFileBuffer(file.id, gpt.companyId);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[file.sheetIndex] ?? workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    const allRows = (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as DatasetRow[];
    const headers = Object.keys(allRows[0] ?? {});
    // Resolved up front so a typo'd name in `columns` fails clearly
    // regardless of aggregate/rows mode, even though projection itself only
    // applies to the rows-mode return below.
    const resolvedColumns = query.columns ? resolveColumns(headers, query.columns) : null;

    let matchingRows = filterRows(allRows, headers, {
      customerId: query.customerId,
      invoiceId: query.invoiceId,
      routeId: query.routeId,
      salesRep: query.salesRep,
      search: query.search,
      filters: query.filters,
    });

    if (query.aggregate) {
      const column = query.aggregate.column ? resolveExactColumn(headers, query.aggregate.column) : undefined;

      if (query.groupBy) {
        const groupColumn = resolveExactColumn(headers, query.groupBy);
        const rowsByGroup = new Map<string, DatasetRow[]>();
        for (const row of matchingRows) {
          const raw = row[groupColumn];
          const key = raw === null || raw === undefined || raw === "" ? "(blank)" : String(raw);
          const bucket = rowsByGroup.get(key);
          if (bucket) bucket.push(row);
          else rowsByGroup.set(key, [row]);
        }
        let allGroups = Array.from(rowsByGroup.entries())
          .map(([groupValue, rows]) => ({ groupValue, rowCount: rows.length, ...computeAggregate(query.aggregate!.op, rows, column) }))
          .sort((a, b) => b.value - a.value); // descending: serves "top N by X" without a separate sort feature
        // sortBy overrides the default above; omitted, behavior is
        // byte-for-byte what it was before Sprint 2.4.
        if (query.sortBy) {
          allGroups = sortGroups(allGroups, resolveGroupSortField(query.sortBy), query.sortDir);
        }
        const groupPage = allGroups.slice(query.offset, query.offset + query.limit);

        await this.usageAnalyticsService.recordEvent({
          companyId: gpt.companyId,
          userId: session.userId,
          gptId: gpt.id,
          eventType: "DATASET_FETCH",
          metadata: {
            fileId: query.fileId,
            datasetType: file.datasetType,
            aggregate: query.aggregate,
            groupBy: groupColumn,
            totalGroups: allGroups.length,
            sortBy: query.sortBy ?? null,
            sortDir: query.sortBy ? query.sortDir : null,
          },
        });

        return {
          id: file.id,
          datasetType: file.datasetType,
          fileName: file.fileName,
          totalMatchingRows: matchingRows.length,
          aggregate: {
            op: query.aggregate.op,
            column: column ?? null,
            groupBy: groupColumn,
            totalGroups: allGroups.length,
            limit: query.limit,
            offset: query.offset,
            hasMore: query.offset + groupPage.length < allGroups.length,
            groups: groupPage,
          },
        };
      }

      const result = computeAggregate(query.aggregate.op, matchingRows, column);

      await this.usageAnalyticsService.recordEvent({
        companyId: gpt.companyId,
        userId: session.userId,
        gptId: gpt.id,
        eventType: "DATASET_FETCH",
        metadata: { fileId: query.fileId, datasetType: file.datasetType, aggregate: query.aggregate, totalMatchingRows: matchingRows.length },
      });

      return {
        id: file.id,
        datasetType: file.datasetType,
        fileName: file.fileName,
        totalMatchingRows: matchingRows.length,
        aggregate: {
          op: query.aggregate.op,
          column: column ?? null,
          value: result.value,
          rowsAggregated: result.rowsAggregated,
          skippedNonNumericRows: result.skippedNonNumericRows,
        },
      };
    }

    // sortBy executes before pagination, exactly like filtering already did
    // — omitted, matchingRows keeps its original file order (unchanged).
    if (query.sortBy) {
      matchingRows = sortRows(matchingRows, resolveExactColumn(headers, query.sortBy), query.sortDir);
    }

    const page = matchingRows.slice(query.offset, query.offset + query.limit);
    // Projection is the last step, applied only to the page actually being
    // returned — never changes totalMatchingRows/hasMore, only which fields
    // each returned row object has.
    const rows = resolvedColumns ? page.map((row) => projectRow(row, resolvedColumns)) : page;

    await this.usageAnalyticsService.recordEvent({
      companyId: gpt.companyId,
      userId: session.userId,
      gptId: gpt.id,
      eventType: "DATASET_FETCH",
      metadata: {
        fileId: query.fileId,
        datasetType: file.datasetType,
        totalMatchingRows: matchingRows.length,
        returnedRows: rows.length,
        sortBy: query.sortBy ?? null,
        sortDir: query.sortBy ? query.sortDir : null,
        columns: query.columns ?? null,
      },
    });

    return {
      id: file.id,
      datasetType: file.datasetType,
      fileName: file.fileName,
      totalMatchingRows: matchingRows.length,
      returnedRows: rows.length,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + rows.length < matchingRows.length,
      rows,
    };
  }

  // POST /gpt/render — the ONLY channel through which the Custom GPT's
  // analysis reaches Analysis Studio. ChatGPT remains the analysis brain
  // and keeps answering in its own chat window as usual; calling this
  // action additionally mirrors that answer (text and/or visual blocks)
  // into Field Sales OS's native UI. The platform never generates or
  // interprets analysis itself here — it only validates the session,
  // persists exactly what the model sent, and lets the frontend's
  // component registry decide how each block type renders.
  async renderAnalysis(rawApiKey: string, sessionToken: string, event: RenderAnalysisEventInput) {
    const { gpt, session } = await this.assertValidSession(rawApiKey, sessionToken);

    const report = await this.analysisEventService.record({
      companyId: gpt.companyId,
      userId: session.userId,
      gptId: gpt.id,
      event,
    });

    await this.usageAnalyticsService.recordEvent({
      companyId: gpt.companyId,
      userId: session.userId,
      gptId: gpt.id,
      eventType: "ANALYSIS_RUN",
      metadata: { blockCount: event.blocks.length, blockTypes: event.blocks.map((b) => b.type) },
    });

    return { received: true, eventId: report.id };
  }
}
