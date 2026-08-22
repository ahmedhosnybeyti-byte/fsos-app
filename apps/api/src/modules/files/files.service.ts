import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Inject } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { extname } from "node:path";
import * as argon2 from "argon2";
import * as XLSX from "xlsx";
import type { Prisma, File as FileRow } from "@field-sales-os/database";
import { FILE_UPLOAD_LIMITS } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { AuditLogService } from "../audit-log/audit-log.service";
import { STORAGE_PROVIDER, type StorageProvider } from "./storage/storage-provider.interface";
import { DatasetClassifierService } from "./classification/dataset-classifier.service";
import type { SheetClassification } from "./classification/types";
import { normalizeHeader } from "./dataset-query.util";
import { ImportTemplateMatcherService } from "../import-validation/import-template-matcher.service";
import { ImportValidationService } from "../import-validation/import-validation.service";
import { ImportValidationRejectedException } from "../import-validation/import-validation.errors";
import type { ImportTemplate, ValidationReport } from "../import-validation/import-validation.types";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";
import { UserActivityService } from "../user-activity/user-activity.service";
import { serializeExcelParse } from "../../common/excel-parse-queue";

const SALES_CALENDAR_ENTITY = "Sales Calendar";
const EMPLOYEES_ENTITY = "Employees";
const PROSPECTS_ENTITY = "Prospects";
const CUSTOMERS_ENTITY = "Customers";
const INVOICES_ENTITY = "Invoices";
const INVOICE_ITEMS_ENTITY = "Invoice Items";

// Sheet Role text -> platform RoleCode, for automatic account provisioning
// (see provisionEmployeeAccounts). Deliberately keyword-based, not an exact
// enum: companies write this column differently ("Sales Rep", "Sales
// Representative", "Region Manager", "Branch Manager", ...). Per the
// Role-vs-Hierarchy separation rule (2026-07-19): this mapping ONLY decides
// what the user may DO (RoleCode -> permissions); what data they SEE is
// derived entirely from the org hierarchy (DirectManagerID closure — see
// rie/canonical-hierarchy-resolver.service.ts), so "Region Manager" and
// "Branch Manager" both map to MANAGER here and still end up with
// completely different data scopes.
function mapSheetRoleToRoleCode(sheetRole: string): "MANAGER" | "SUPERVISOR" | "SALES_REP" | null {
  const r = sheetRole.trim().toLowerCase();
  if (!r) return null;
  if (r.includes("supervisor") || r.includes("مشرف")) return "SUPERVISOR";
  if (r.includes("rep") || r.includes("مندوب")) return "SALES_REP";
  if (r.includes("manager") || r.includes("مدير")) return "MANAGER";
  return null;
}

// URL-safe, unambiguous 10-char temporary password.
function generateTempPassword(): string {
  return randomBytes(8).toString("base64url").slice(0, 10);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-100);
}

// datasetType may be platform-detected or user-provided either way; it
// becomes part of the object storage key below, so it's sanitized the same
// way as a filename regardless of where it came from.
function sanitizeDatasetType(datasetType: string): string {
  const cleaned = datasetType.replace(/[^a-zA-Z0-9.\-_ ]/g, "_").trim();
  return (cleaned || "dataset").slice(0, 60);
}

function buildParsedMetadata(sheetNames: string[], sheet: SheetClassification) {
  return {
    sheetNames,
    rowCount: sheet.rowCount,
    headers: sheet.headers,
    headerCount: sheet.headers.length,
    // Metadata Layer (Sprint 2.2): per-column type/shape + the Smart
    // Metadata below, both surfaced to the GPT via GptService's
    // toDatasetSummary — see dataset-classifier.service.ts for how each is
    // computed.
    columns: sheet.columns,
    detected: sheet.detected,
  };
}

// ---- Sales Calendar ingestion helpers ----
// Sales Calendar is the one Canonical Entity that lands in a real Postgres
// table (see schema.prisma's SalesCalendar model) instead of staying as
// Excel bytes re-parsed on every RIE query — see ingestSalesCalendar below.
// These coercions are tolerant on purpose (same spirit as
// targets.service.ts's toPeriodMonth/toFiniteNumber): a company's real
// export is far more likely to have "TRUE"/"1"/"Yes" than a clean boolean,
// and per ADR-002 this ingestion step never REJECTS a row for a messy
// value — an uncoercible cell just lands as null, same as if it were blank.
function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = new Date(value.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date fallback — shouldn't normally hit this since every
    // read in this file uses cellDates:true, but a text-formatted numeric
    // cell can still slip through as a raw number.
    const excelEpoch = Date.UTC(1899, 11, 30);
    const d = new Date(excelEpoch + value * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toIntOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

function toBoolOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["yes", "true", "1", "y"].includes(v)) return true;
    if (["no", "false", "0", "n"].includes(v)) return false;
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "number") return JSON.stringify(Number(value.toPrecision(15)));
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
// One outcome per sheet that WAS named after an official entity but didn't
// make it into `accepted` — either it failed structural validation
// (`report` set) or something else went wrong reading/storing it
// (`message` set, `report` null).
export interface RejectedSheetOutcome {
  sheetName: string;
  entity: string;
  report: ValidationReport | null;
  message?: string;
}

export interface IgnoredSheetOutcome {
  sheetName: string;
}

// One sheet that WAS matched to an official entity but was skipped because
// this exact entity, from this exact physical file (same bytes), is
// already active for this company — re-importing it would just create a
// duplicate File row with identical data. Reported separately from
// `ignored` (sheets with no entity match at all) and `rejected` (real
// validation failures) so a partial re-upload reads as "nothing changed
// here, already up to date" rather than an error. See the Smart Merge
// comment in processWorkbook for the full behavior this enables.
export interface SkippedSheetOutcome {
  sheetName: string;
  entity: string;
  message: string;
}

// One newly-provisioned employee account — tempPassword appears HERE, in
// this one upload response, and nowhere else ever again (it's stored only
// as an argon2 hash). The admin copies/distributes it; the employee must
// change it on first login (mustChangePassword).
export interface ProvisionedAccount {
  email: string;
  fullName: string;
  roleCode: string;
  tempPassword: string;
}

export interface ProvisioningResult {
  created: ProvisionedAccount[];
  updatedCount: number;
  /** Rows that couldn't be provisioned, with a human-readable reason each. */
  skipped: string[];
}

// What one physical upload produces — up to 18 accepted entities (one File
// row each, all sharing `batchId`), plus whatever named sheets failed
// validation and whatever sheets weren't named after any official entity
// at all. See FilesService.processWorkbook.
export interface BatchUploadResult {
  batchId: string;
  fileName: string;
  accepted: FileRow[];
  rejected: RejectedSheetOutcome[];
  ignored: IgnoredSheetOutcome[];
  skipped: SkippedSheetOutcome[];
  // Present only when this batch contained an accepted Employees sheet —
  // automatic account provisioning ran (see provisionEmployeeAccounts).
  provisioning?: ProvisioningResult;
}

export interface ReplaceFileCarryOver {
  sgiConfigUpdated: boolean;
}

export interface ReplaceFileOutcome {
  file: FileRow;
  carryOver: ReplaceFileCarryOver | null;
  // Any OTHER entities this same upload also contained and successfully
  // imported alongside the one being replaced — e.g. the admin re-uploaded
  // the full multi-sheet master file just to refresh one entity, and it
  // happened to also refresh/add others. Empty in the common single-entity
  // replace case.
  otherAccepted: FileRow[];
}

// 2026-07-20: multi-sheet batch uploads (File.batchId) store every sheet's
// File row against the SAME physical storageKey — one uploaded .xlsx is
// literally one object in storage, shared by up to 18 File records (one per
// entity/sheet). Every reader (ExcelDatasetEntityProvider,
// CanonicalHierarchyResolverService, the GPT Action, Route Planning,
// Targets) calls downloadFileBuffer independently per entity, so a single
// Visit Copilot daily-brief touching 8+ entities was re-downloading the
// exact same bytes (measured: a real 40MB seed file) 8+ times over — this
// showed up as download times that kept growing request over request (as
// concurrent large downloads queued behind each other) even after the
// parse-side caches were added. Caching the raw buffer by storageKey here,
// below every one of those call sites, means the whole request pays for
// that download exactly once regardless of how many entities share the
// file. Safe indefinitely by construction: storageKey embeds an upload
// timestamp+batchId, so a new upload never reuses an old key — no
// invalidation logic needed, only a TTL/size cap to bound memory.
// 2026-07-20: bumped from 5 minutes to 5 hours (~one work shift) after
// confirming correctness never depends on this TTL — cache entries are
// invalidated immediately on a new/replaced upload via the storageKey
// itself changing, not by expiring. The TTL only bounds how long we hold
// memory for data nobody's actively asking for; at current company/dataset
// scale, trading a few hundred MB of RAM for far fewer cold-cache stalls
// during a normal workday (rep opens app, steps away, comes back) is a
// clear win. Revisit downward only if per-company memory footprint becomes
// a real constraint (many more companies, each with large active datasets).
const FILE_BUFFER_CACHE_TTL_MS = 5 * 60 * 60_000;
const FILE_BUFFER_CACHE_MAX_ENTRIES = 50;

interface FileBufferCacheEntry {
  buffer: Promise<Buffer>;
  createdAt: number;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly bufferCache = new Map<string, FileBufferCacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly classifier: DatasetClassifierService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly importTemplateMatcher: ImportTemplateMatcherService,
    private readonly importValidation: ImportValidationService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly userActivity: UserActivityService,
  ) {}

  private validateUpload(file: Express.Multer.File, maxUploadSizeMb: number) {
    if (extname(file.originalname).toLowerCase() !== ".xlsx" || file.mimetype !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      throw new BadRequestException("Only .xlsx files are allowed");
    }
    if (file.size > maxUploadSizeMb * 1024 * 1024) {
      throw new BadRequestException(`File exceeds this company's ${maxUploadSizeMb}MB upload limit`);
    }
  }

  private async getUploadSizeLimitMb(companyId: string): Promise<number> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { maxExcelUploadSizeMb: true } });
    if (!company) throw new NotFoundException("Company not found");
    return company.maxExcelUploadSizeMb ?? 100;
  }

  // The active-upload gate counts BATCHES (distinct physical uploads), not
  // individual entity rows — a single 18-sheet master-file upload produces
  // up to 18 File rows but is still just ONE upload. See File.batchId's
  // doc comment in schema.prisma. (2026-07-19 — previously counted File
  // rows directly, which a multi-sheet upload would nearly exhaust in one
  // shot.)
  private async countActiveBatches(companyId: string): Promise<number> {
    const rows = await this.prisma.file.findMany({
      where: { companyId, isActive: true },
      distinct: ["batchId"],
      select: { batchId: true },
    });
    return rows.length;
  }

  // The user never picks a dataset type or maps any column — ADR-001 §2
  // (full enforcement, superseding the earlier non-breaking rollout): every
  // upload is matched against the closest of the FSOS Import Templates and
  // validated against it. There is no best-guess/manual-confirm fallback
  // left — a sheet that doesn't match a template well enough is rejected
  // outright with a Validation Report (see processWorkbook). Any
  // authenticated company member may upload — datasets are business data
  // sources, not organizational-role slots, so there is no per-role upload
  // restriction.
  // Used by FilesController's SUPER_ADMIN target-company resolution — the
  // chosen id must be a real company before anything is written under it.
  async assertCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw new BadRequestException("The selected target company does not exist.");
  }

  async uploadFile(params: {
    companyId: string;
    uploadedByUserId: string;
    file: Express.Multer.File;
    viaSuperAdmin?: boolean;
    canProvisionEmployeeAccounts: boolean;
  }): Promise<BatchUploadResult> {
    const { companyId, uploadedByUserId, file, viaSuperAdmin, canProvisionEmployeeAccounts } = params;

    this.validateUpload(file, await this.getUploadSizeLimitMb(companyId));

    const activeBatchCount = await this.countActiveBatches(companyId);
    if (activeBatchCount >= FILE_UPLOAD_LIMITS.maxActiveFilesPerCompany) {
      throw new BadRequestException(
        `Your company already has ${FILE_UPLOAD_LIMITS.maxActiveFilesPerCompany} active uploads. Remove one before uploading another.`,
      );
    }

    const result = await this.processWorkbook({ companyId, uploadedByUserId, file, viaSuperAdmin, canProvisionEmployeeAccounts });
    await this.userActivity.record({ type: "BIZ_FILE_UPLOAD", category: "BUSINESS", actorUserId: uploadedByUserId, subjectUserId: uploadedByUserId, companyId, targetType: "FileBatch", targetId: result.batchId, source: "files.upload", metadata: { acceptedSheets: result.accepted.length, rejectedSheets: result.rejected.length, viaSuperAdmin: Boolean(viaSuperAdmin) } });

    // Preserve the pre-existing single-file-reject contract (HTTP 422 +
    // full ValidationReport body — see ImportValidationRejectedException)
    // for the common case: exactly one sheet was attempted and it failed
    // outright. A genuine multi-sheet batch (any mix of accepted/rejected/
    // ignored, or more than one rejected sheet) returns normally instead,
    // so the caller can render a per-sheet summary — an HTTP exception
    // can't carry that richer shape as naturally as a 200 response body.
    if (result.accepted.length === 0 && result.rejected.length === 1 && result.ignored.length === 0 && result.rejected[0]!.report) {
      throw new ImportValidationRejectedException(result.rejected[0]!.report);
    }

    return result;
  }

  // Sheet + template selection — the ONLY place that decides which Import
  // Template(s) an uploaded workbook is validated against. Per the strict-
  // matching requirement (a single misclassification here can pollute the
  // whole Canonical Database), it consults ONLY signals that are part of
  // the official template itself:
  //   1. Official sheet name (ImportTemplate.entity IS the official
  //      Canonical Database sheet name) — the strongest signal.
  //   2. Sheet position/order — trivially "fixed" for single-sheet files
  //      (there's only one), so no ambiguity to resolve there.
  //   3. Official column names — the remaining signal for single-sheet
  //      files whose one sheet isn't named after an entity.
  // It NEVER uses: the uploader's filename, or any confidence-based
  // guess (that whole mechanism was removed 2026-07-26 — see
  // dataset-classifier.service.ts), or any other metadata outside the
  // template's own content.
  //
  // Multi-sheet workbooks (2026-07-19 decision) are no longer rejected
  // outright — a single upload may contain up to all 18 canonical entities
  // at once, each on its own officially-named sheet. Every sheet is
  // resolved independently by NAME ONLY (never by column-overlap guessing
  // across sheets): a sheet whose name matches no official entity is
  // simply ignored; two-or-more sheets that both match the SAME entity are
  // ambiguous and neither is imported.
  private resolveSheetsAndTemplates(sheets: readonly SheetClassification[]): {
    toValidate: { sheet: SheetClassification; template: ImportTemplate }[];
    ignored: SheetClassification[];
    ambiguous: { entity: string; sheets: SheetClassification[] }[];
  } {
    const namedMatches = sheets
      .map((sheet) => ({ sheet, template: this.importTemplateMatcher.matchBySheetName(sheet.sheetName) }))
      .filter((m): m is { sheet: SheetClassification; template: ImportTemplate } => m.template !== null);

    if (sheets.length === 1) {
      const sheet = sheets[0]!;
      const template = namedMatches[0]?.template ?? this.importTemplateMatcher.bestMatch(sheet.headers).template;
      return { toValidate: [{ sheet, template }], ignored: [], ambiguous: [] };
    }

    const byEntity = new Map<string, SheetClassification[]>();
    for (const m of namedMatches) {
      const list = byEntity.get(m.template.entity) ?? [];
      list.push(m.sheet);
      byEntity.set(m.template.entity, list);
    }

    const toValidate: { sheet: SheetClassification; template: ImportTemplate }[] = [];
    const ambiguous: { entity: string; sheets: SheetClassification[] }[] = [];
    const seenAmbiguousEntities = new Set<string>();
    for (const m of namedMatches) {
      const sameEntitySheets = byEntity.get(m.template.entity)!;
      if (sameEntitySheets.length > 1) {
        if (!seenAmbiguousEntities.has(m.template.entity)) {
          seenAmbiguousEntities.add(m.template.entity);
          ambiguous.push({ entity: m.template.entity, sheets: sameEntitySheets });
        }
        continue;
      }
      toValidate.push(m);
    }

    const namedSheetIndexes = new Set(namedMatches.map((m) => m.sheet.sheetIndex));
    const ignored = sheets.filter((s) => !namedSheetIndexes.has(s.sheetIndex));

    return { toValidate, ignored, ambiguous };
  }

  // The classify-store-record part of upload/replace, generalized
  // (2026-07-19) to process EVERY sheet in a workbook independently: valid
  // named sheets are each saved as their own dataset (all sharing one
  // batchId + one stored copy of the uploaded bytes), invalid named sheets
  // are reported individually without blocking the rest, and unnamed
  // sheets are silently ignored. Split out of uploadFile so replaceFile
  // (below) can reuse it without going through the active-batch-count gate
  // — a replace is refreshing existing data, not growing the count.
  private async processWorkbook(params: {
    companyId: string;
    uploadedByUserId: string;
    file: Express.Multer.File;
    viaSuperAdmin?: boolean;
    canProvisionEmployeeAccounts: boolean;
  }): Promise<BatchUploadResult> {
    const { companyId, uploadedByUserId, file, viaSuperAdmin, canProvisionEmployeeAccounts } = params;

    // 2026-07-26 — Smart Merge: this used to be a whole-file guard here
    // (reject the entire upload outright if these exact bytes were already
    // active for this company). That broke a real workflow: a multi-sheet
    // batch shares ONE physical blob/contentHash across every sheet's File
    // row, so deleting just a few sheets (meaning to re-import only those)
    // and re-uploading the SAME unchanged file got rejected wholesale,
    // because the file's hash still matched the sheets that were never
    // deleted. Duplicate detection now happens per sheet, inside the loop
    // below (see the `existingActiveSameEntity` check): each sheet's entity
    // is checked independently against what's already active for this
    // company with this exact content, so sheets that are missing/deleted
    // get imported while sheets that are already active and unchanged are
    // skipped (not duplicated) — a true partial re-upload instead of an
    // all-or-nothing reject. contentHash itself is unchanged — still one
    // hash per physical file, stored on every sheet's File row as before.
    const contentHash = createHash("sha256").update(file.buffer).digest("hex");

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    } catch {
      throw new BadRequestException("Could not read this file — is it a valid .xlsx or .xls workbook?");
    }

    // classifyWorkbook still runs — it enumerates every sheet and builds the
    // Smart Metadata (headers/rowCount/detected period-region-branch-rep-
    // route) used for display and the model's dataset summaries. It has no
    // opinion on dataset TYPE at all (that guess was removed 2026-07-26) —
    // resolveSheetsAndTemplates above is the sole decider of which sheet(s)
    // get validated or accepted.
    const classification = this.classifier.classifyWorkbook(workbook);
    if (classification.sheets.length === 0) {
      throw new BadRequestException("Could not find any readable sheet with data in this file.");
    }

    const { toValidate, ignored, ambiguous } = this.resolveSheetsAndTemplates(classification.sheets);

    // An accepted Employees sheet provisions accounts and updates roles. This
    // server-side check runs before storage or processing, so a hand-crafted
    // multipart request cannot elevate a rep, supervisor, or manager.
    if (!canProvisionEmployeeAccounts && toValidate.some(({ template }) => template.entity === EMPLOYEES_ENTITY)) {
      throw new ForbiddenException("Only a company administrator can upload an Employees sheet.");
    }

    if (toValidate.length === 0 && ambiguous.length === 0 && classification.sheets.length > 1) {
      const officialNames = this.importTemplateMatcher
        .listTemplates()
        .map((t) => t.entity)
        .join(", ");
      throw new BadRequestException(
        `This file has ${classification.sheets.length} sheets (${classification.sheets.map((s) => s.sheetName).join(", ")}), and none of them is named after an official FSOS entity (${officialNames}). Rename a sheet to match its entity's official name, or upload one sheet per file.`,
      );
    }

    const batchId = randomBytes(12).toString("hex");
    const storageKey = `${companyId}/_uploads/${Date.now()}-${batchId}-${sanitizeFileName(file.originalname)}`;
    await this.storage.upload({ key: storageKey, body: file.buffer, contentType: file.mimetype });

    let provisioning: ProvisioningResult | undefined;
    const rejected: RejectedSheetOutcome[] = ambiguous.map((a) => ({
      sheetName: a.sheets.map((s) => s.sheetName).join(" / "),
      entity: a.entity,
      report: null,
      message: `${a.sheets.length} sheets in this file are all named "${a.entity}" — ambiguous, none of them were imported. Keep only one sheet per official entity.`,
    }));
    const accepted: FileRow[] = [];
    const skipped: SkippedSheetOutcome[] = [];

    // Trial data-volume cap — checked once per upload, only against the
    // "Customers" sheet (the clearest single proxy for "how big is this
    // company's real dataset"). Deliberately NOT enforced for
    // ACTIVE/paid companies at all. Balances letting a genuine evaluator
    // test with a realistic dataset against unbounded storage growth from
    // repeated throwaway trial uploads (see PlatformSettings.trialMaxActiveCustomers).
    const subscription = await this.subscriptionsService.findCurrentForCompany(companyId);
    const isTrial = subscription?.status === "TRIAL";

    for (const { sheet, template } of toValidate) {
      const datasetType = template.entity;

      // Smart Merge (2026-07-26): per-sheet duplicate check, replacing the
      // old whole-file guard (see comment above). This entity, from this
      // exact physical file (same bytes), is already active for this
      // company — importing it again would only create a duplicate File
      // row with identical data, so skip it. A sheet whose entity was
      // deleted (or never uploaded) simply won't match here and proceeds to
      // import below, regardless of what else in the same file is a repeat.
      const existingActiveSameEntity = await this.prisma.file.findFirst({
        where: { companyId, datasetType, contentHash, isActive: true },
        select: { fileName: true, createdAt: true },
      });
      if (existingActiveSameEntity) {
        skipped.push({
          sheetName: sheet.sheetName,
          entity: datasetType,
          message: `"${datasetType}" من هذا الملف نفسه (بنفس المحتوى) موجود بالفعل ونشط منذ ${existingActiveSameEntity.createdAt.toISOString().slice(0, 10)} — تم تجاهله لتفادي التكرار.`,
        });
        continue;
      }

      const sheetName = workbook.SheetNames[sheet.sheetIndex];
      const xlsSheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!xlsSheet) {
        rejected.push({ sheetName: sheet.sheetName, entity: template.entity, report: null, message: "Could not read this sheet." });
        continue;
      }
      const rows = XLSX.utils.sheet_to_json(xlsSheet) as Record<string, unknown>[];

      // Import Validation gate (ADR-001 §2 / ADR-002 structure-only, full
      // enforcement). Runs BEFORE any File row is created for this sheet —
      // a rejected sheet leaves no trace.
      const match = this.importTemplateMatcher.matchAgainst(template, sheet.headers);
      const report = this.importValidation.validate({ template, fileName: file.originalname, headers: sheet.headers, rows });
      if (!report.valid) {
        rejected.push({ sheetName: sheet.sheetName, entity: template.entity, report });
        continue;
      }

      if (isTrial && template.entity === "Customers") {
        const settings = await this.platformSettingsService.get();
        if (rows.length > settings.trialMaxActiveCustomers) {
          rejected.push({
            sheetName: sheet.sheetName,
            entity: template.entity,
            report: null,
            message: `Trial accounts are limited to ${settings.trialMaxActiveCustomers} customers (this file has ${rows.length}). Upgrade to a paid plan to upload larger datasets.`,
          });
          continue;
        }
      }

      const fileRecord = await this.prisma.file.create({
        data: {
          companyId,
          uploadedByUserId,
          datasetType,
          datasetTypeConfidence: Math.round(match.score * 100),
          // Always true — a File row only ever exists once its sheet has
          // passed strict validation against a specific template.
          datasetTypeConfirmed: true,
          sheetIndex: sheet.sheetIndex,
          batchId,
          contentHash,
          fileName: file.originalname,
          storageKey,
          sizeBytes: file.size,
          status: "PROCESSING",
        },
      });

      try {
        const metadata = buildParsedMetadata(workbook.SheetNames, sheet);

        // Phase 1 RIE Scale: materialize Customers into Postgres as a shadow
        // only. The active RIE provider remains Excel; this write is kept
        // entirely outside every read path and API contract.
        if (datasetType === CUSTOMERS_ENTITY) {
          await this.materializeCustomersShadow({ companyId, fileId: fileRecord.id, rows });
        }
        if (datasetType === INVOICES_ENTITY) {
          await this.materializeInvoicesShadow({ companyId, fileId: fileRecord.id, rows });
        }
        if (datasetType === INVOICE_ITEMS_ENTITY) {
          await this.materializeInvoiceItemsShadow({ companyId, fileId: fileRecord.id, rows });
        }

        const updated = await this.prisma.file.update({
          where: { id: fileRecord.id },
          data: { status: "READY", parsedMetadata: metadata as unknown as Prisma.InputJsonValue },
        });

        if (datasetType === SALES_CALENDAR_ENTITY) {
          await this.ingestSalesCalendar({ companyId, fileId: updated.id, headers: sheet.headers, rows });
        }
        if (datasetType === EMPLOYEES_ENTITY) {
          provisioning = await this.provisionEmployeeAccounts({ companyId, uploadedByUserId, headers: sheet.headers, rows });
          // Phase 5's Employee registry (employees table) is a separate
          // structure from the User accounts provisionEmployeeAccounts just
          // created/updated above — screens like the per-employee scoped
          // Excel export and Priority Center hierarchy grouping read the
          // Employee registry, not User, so an Employees sheet upload must
          // keep both in sync or those screens see an empty roster despite
          // real accounts existing. See provisionEmployeeRecords below.
          await this.provisionEmployeeRecords({ companyId, headers: sheet.headers, rows });
        }
        if (datasetType === PROSPECTS_ENTITY) {
          await this.ingestProspects({ companyId, fileId: updated.id, headers: sheet.headers, rows });
        }

        await this.auditLogService.record({
          companyId,
          userId: uploadedByUserId,
          action: "files.upload",
          entityType: "File",
          entityId: fileRecord.id,
          // viaSuperAdmin marks an on-behalf-of upload: userId above is the
          // Super Admin who uploaded, companyId is the target company they
          // explicitly picked — the audit trail the target-company picker
          // feature requires (uploaded by / target company / time).
          metadata: { datasetType, confidence: Math.round(match.score * 100), fileName: file.originalname, batchId, ...(viaSuperAdmin ? { viaSuperAdmin: true } : {}) },
        });

        accepted.push(updated);
      } catch (err) {
        this.logger.error(`Failed to process upload ${fileRecord.id}`, err instanceof Error ? err.stack : undefined);
        await this.prisma.file.update({ where: { id: fileRecord.id }, data: { status: "FAILED" } });
        rejected.push({
          sheetName: sheet.sheetName,
          entity: template.entity,
          report: null,
          message: "Could not process this sheet after upload — please try again.",
        });
      }
    }

    return {
      batchId,
      fileName: file.originalname,
      accepted,
      rejected,
      ignored: ignored.map((s) => ({ sheetName: s.sheetName })),
      skipped,
      provisioning,
    };
  }

  /**
   * Stores an exact JSON copy of the validated Customers rows. The version
   * becomes ACTIVE only after row-count, CustomerCode keys, and row payloads
   * match the Excel parse. This method is deliberately write-only.
   */
  private async materializeCustomersShadow(params: {
    companyId: string;
    fileId: string;
    rows: Record<string, unknown>[];
  }): Promise<void> {
    const { companyId, fileId, rows } = params;
    const customerCodes = rows.map((row) => String(row.CustomerCode ?? "").trim());
    if (customerCodes.some((key) => !key)) throw new Error("Customers shadow materialization requires CustomerCode on every row.");

    await this.prisma.$transaction(async (tx) => {
      const version = await tx.rieDatasetVersion.create({
        data: { companyId, sourceFileId: fileId, entityName: CUSTOMERS_ENTITY },
      });

      if (rows.length > 0) {
        await tx.rieEntityRow.createMany({
          data: rows.map((data, index) => ({
            companyId,
            datasetVersionId: version.id,
            entityName: CUSTOMERS_ENTITY,
            entityKey: customerCodes[index]!,
            data: data as Prisma.InputJsonValue,
          })),
        });
      }

      const materializedRows = await tx.rieEntityRow.findMany({
        where: { datasetVersionId: version.id },
        select: { entityKey: true, data: true },
        orderBy: { entityKey: "asc" },
      });
      const excelByKey = new Map(rows.map((row, index) => [customerCodes[index]!, stableJson(row)]));
      const matches = materializedRows.length === rows.length
        && materializedRows.length === excelByKey.size
        && materializedRows.every((row) => excelByKey.get(row.entityKey) === stableJson(row.data));
      if (!matches) throw new Error("Customers Excel/PostgreSQL shadow verification failed.");

      await tx.rieDatasetVersion.update({
        where: { id: version.id },
        data: { status: "ACTIVE", isActive: true, rowCount: rows.length, materializedAt: new Date(), activatedAt: new Date() },
      });
    }, { timeout: 30_000 });
  }

  private async materializeInvoicesShadow(params: { companyId: string; fileId: string; rows: Record<string, unknown>[] }): Promise<void> {
    return this.materializeEntityShadow({ ...params, entityName: INVOICES_ENTITY, keyColumns: ["InvoiceNo"] });
  }

  private async materializeInvoiceItemsShadow(params: { companyId: string; fileId: string; rows: Record<string, unknown>[] }): Promise<void> {
    return this.materializeEntityShadow({ ...params, entityName: INVOICE_ITEMS_ENTITY, keyColumns: ["InvoiceNo", "LineNo"] });
  }

  /** Write-only shadow materialization for the two invoice datasets. */
  private async materializeEntityShadow(params: {
    companyId: string;
    fileId: string;
    entityName: string;
    keyColumns: readonly string[];
    rows: Record<string, unknown>[];
  }): Promise<void> {
    const { companyId, fileId, entityName, keyColumns, rows } = params;
    const entityKeys = rows.map((row) => keyColumns.map((column) => String(row[column] ?? "").trim()).join("␟"));
    if (entityKeys.some((key) => !key || key.split("␟").some((part) => !part))) {
      throw new Error(`${entityName} shadow materialization requires ${keyColumns.join(", ")} on every row.`);
    }
    if (new Set(entityKeys).size !== entityKeys.length) {
      throw new Error(`${entityName} shadow materialization requires unique canonical keys.`);
    }

    await this.prisma.$transaction(async (tx) => {
      const version = await tx.rieDatasetVersion.create({
        data: { companyId, sourceFileId: fileId, entityName },
      });
      if (rows.length > 0) {
        await tx.rieEntityRow.createMany({
          data: rows.map((data, index) => ({
            companyId,
            datasetVersionId: version.id,
            entityName,
            entityKey: entityKeys[index]!,
            data: data as Prisma.InputJsonValue,
          })),
        });
      }

      const materializedRows = await tx.rieEntityRow.findMany({
        where: { datasetVersionId: version.id },
        select: { entityKey: true, data: true },
        orderBy: { entityKey: "asc" },
      });
      const excelByKey = new Map(rows.map((row, index) => [entityKeys[index]!, stableJson(row)]));
      const matches = materializedRows.length === rows.length
        && materializedRows.length === excelByKey.size
        && materializedRows.every((row) => excelByKey.get(row.entityKey) === stableJson(row.data));
      if (!matches) throw new Error(`${entityName} Excel/PostgreSQL shadow verification failed.`);

      await tx.rieDatasetVersion.update({
        where: { id: version.id },
        data: { status: "ACTIVE", isActive: true, rowCount: rows.length, materializedAt: new Date(), activatedAt: new Date() },
      });
    }, { timeout: 30_000 });
  }

  // Automatic Employee Account Provisioning (2026-07-19) — runs once per
  // ACCEPTED Employees sheet, driven entirely from the master data:
  //   - New employee (no User with that email anywhere): account created
  //     with RoleCode mapped from the sheet's Role text (permissions only —
  //     data scope comes from the DirectManagerID hierarchy, never from the
  //     role; see mapSheetRoleToRoleCode), a random temp password (returned
  //     ONCE in this upload's response, stored only as a hash), and
  //     mustChangePassword=true so first login forces a real password.
  //   - Existing employee in THIS company: fullName/role refreshed in place
  //     — never a duplicate account. COMPANY_ADMIN/SUPER_ADMIN accounts are
  //     never modified by a sheet (a data upload must not be able to demote
  //     an admin).
  //   - Email already used by ANOTHER company's user: skipped + reported —
  //     never touched (tenant isolation).
  // Row-level problems (bad email, unknown role text, inactive status) skip
  // that row with a reason; they never fail the sheet — same partial-accept
  // spirit as the batch upload itself.
  private async provisionEmployeeAccounts(params: {
    companyId: string;
    uploadedByUserId: string;
    headers: string[];
    rows: Record<string, unknown>[];
  }): Promise<ProvisioningResult> {
    const { companyId, uploadedByUserId, headers, rows } = params;
    const headerLookup = new Map(headers.map((h) => [normalizeHeader(h), h]));
    const col = (name: string) => headerLookup.get(normalizeHeader(name));

    const emailCol = col("Email");
    const nameCol = col("EmployeeName");
    const roleCol = col("Role");
    const statusCol = col("Status");
    const result: ProvisioningResult = { created: [], updatedCount: 0, skipped: [] };
    if (!emailCol || !roleCol) {
      result.skipped.push("Email/Role columns missing — no accounts provisioned.");
      return result;
    }

    const roleRows = await this.prisma.role.findMany({ where: { code: { in: ["MANAGER", "SUPERVISOR", "SALES_REP"] } } });
    const roleIdByCode = new Map(roleRows.map((r) => [r.code, r.id]));

    const seenEmails = new Set<string>();
    for (const row of rows) {
      const email = String(row[emailCol] ?? "").trim().toLowerCase();
      const fullName = String((nameCol ? row[nameCol] : "") ?? "").trim() || email;
      const sheetRole = String(row[roleCol] ?? "").trim();
      const status = statusCol ? String(row[statusCol] ?? "").trim().toLowerCase() : "active";

      if (!email || !email.includes("@")) {
        if (sheetRole || fullName !== email) result.skipped.push(`${fullName || "?"}: بريد إلكتروني غير صالح.`);
        continue;
      }
      if (seenEmails.has(email)) {
        result.skipped.push(`${email}: مكرر داخل الشيت — اتعمل حساب لأول ظهور فقط.`);
        continue;
      }
      seenEmails.add(email);

      if (status && status !== "active") {
        result.skipped.push(`${email}: حالة الموظف "${status}" مش Active — لم يُنشأ حساب.`);
        continue;
      }

      const roleCode = mapSheetRoleToRoleCode(sheetRole);
      if (!roleCode) {
        result.skipped.push(`${email}: الدور "${sheetRole}" غير معروف (المتوقع: يحتوي Manager أو Supervisor أو Rep).`);
        continue;
      }
      const roleId = roleIdByCode.get(roleCode);
      if (!roleId) {
        result.skipped.push(`${email}: الدور ${roleCode} غير موجود في جدول الأدوار.`);
        continue;
      }

      const existing = await this.prisma.user.findUnique({ where: { email }, include: { role: true } });
      if (existing) {
        if (existing.companyId !== companyId) {
          result.skipped.push(`${email}: البريد مستخدم بالفعل في حساب خارج هذه الشركة — لم يُلمس.`);
          continue;
        }
        if (existing.role.code === "COMPANY_ADMIN" || existing.role.code === "SUPER_ADMIN") {
          continue; // admin accounts are never modified from a data upload
        }
        const needsUpdate = existing.fullName !== fullName || existing.roleId !== roleId;
        if (needsUpdate) {
          await this.prisma.user.update({ where: { id: existing.id }, data: { fullName, roleId } });
          result.updatedCount++;
        }
        continue;
      }

      const tempPassword = generateTempPassword();
      await this.prisma.user.create({
        data: {
          companyId,
          roleId,
          email,
          fullName,
          passwordHash: await argon2.hash(tempPassword),
          mustChangePassword: true,
        },
      });
      result.created.push({ email, fullName, roleCode, tempPassword });
    }

    if (result.created.length > 0 || result.updatedCount > 0) {
      await this.auditLogService.record({
        companyId,
        userId: uploadedByUserId,
        action: "users.provisionFromEmployeesSheet",
        entityType: "User",
        metadata: {
          createdCount: result.created.length,
          createdEmails: result.created.map((c) => c.email),
          updatedCount: result.updatedCount,
          skippedCount: result.skipped.length,
        },
      });
    }

    return result;
  }

  // Employee Registry Auto-Provisioning (2026-07-27) — keeps Phase 5's
  // `employees` table in sync with every accepted Employees sheet, the same
  // way provisionEmployeeAccounts keeps `User` in sync. Discovered as a gap
  // when the per-employee scoped Excel export's picker list (Files screen)
  // came back empty for a real company that HAD an accepted Employees
  // upload: accounts existed, but nobody had ever manually added the
  // matching Employee record, because until now nothing did it
  // automatically. Upsert keyed on (companyId, employeeCode=EmployeeID) —
  // safe to run on every re-upload. managerId is resolved in a second pass
  // once every row's Employee record exists, so declaration order in the
  // sheet (a manager listed after their own report) never matters — this is
  // the same two-pass shape as provisionEmployeeAccounts' self-referencing
  // DirectManagerID handling used elsewhere in this codebase (Routes
  // hierarchy resolution). Row-level problems skip that row silently (this
  // is a best-effort sync, not a validated form — provisionEmployeeAccounts
  // above already surfaces the user-facing skip reasons for the same rows).
  // Deliberately does not touch orgUnitId/BranchID mapping — Employee's org
  // unit linkage is reference-only per the Phase 5 constitution and is left
  // for a company admin to set explicitly, same as before this method
  // existed.
  private async provisionEmployeeRecords(params: {
    companyId: string;
    headers: string[];
    rows: Record<string, unknown>[];
  }): Promise<void> {
    const { companyId, headers, rows } = params;
    const headerLookup = new Map(headers.map((h) => [normalizeHeader(h), h]));
    const col = (name: string) => headerLookup.get(normalizeHeader(name));

    const idCol = col("EmployeeID");
    const nameCol = col("EmployeeName");
    const emailCol = col("Email");
    const managerCol = col("DirectManagerID");
    const hireDateCol = col("HireDate");
    const statusCol = col("Status");
    if (!idCol || !nameCol) return; // required fields missing — provisionEmployeeAccounts already reported this sheet as unusable.

    const existingUsers = await this.prisma.user.findMany({ where: { companyId }, select: { id: true, email: true } });
    const userIdByEmail = new Map(existingUsers.map((u) => [u.email.trim().toLowerCase(), u.id]));

    // Pass 1: upsert every row's own Employee fields (never managerId yet —
    // the target row may not exist as an Employee record until this same
    // pass creates it).
    const employeeIdByCode = new Map<string, string>();
    const seenCodes = new Set<string>();
    for (const row of rows) {
      const employeeCode = String(row[idCol] ?? "").trim();
      const fullName = String(row[nameCol] ?? "").trim();
      if (!employeeCode || !fullName || seenCodes.has(employeeCode)) continue;
      seenCodes.add(employeeCode);

      const email = emailCol ? String(row[emailCol] ?? "").trim().toLowerCase() : "";
      const sheetStatus = statusCol ? String(row[statusCol] ?? "").trim().toLowerCase() : "active";
      const status: "ACTIVE" | "INACTIVE" = sheetStatus === "inactive" ? "INACTIVE" : "ACTIVE";
      const hireDateRaw = hireDateCol ? row[hireDateCol] : undefined;
      const hireDate = hireDateRaw ? new Date(String(hireDateRaw)) : undefined;
      const linkedUserId = email ? userIdByEmail.get(email) : undefined;

      const saved = await this.prisma.employee.upsert({
        where: { companyId_employeeCode: { companyId, employeeCode } },
        create: {
          companyId,
          employeeCode,
          fullName,
          status,
          contactEmail: email || undefined,
          hireDate: hireDate && !Number.isNaN(hireDate.getTime()) ? hireDate : undefined,
          userId: linkedUserId,
        },
        update: {
          fullName,
          status,
          contactEmail: email || undefined,
          hireDate: hireDate && !Number.isNaN(hireDate.getTime()) ? hireDate : undefined,
          // Never clobber a manually-set userId link with undefined; only
          // overwrite it when this sheet actually resolves one.
          ...(linkedUserId ? { userId: linkedUserId } : {}),
        },
        select: { id: true },
      });
      employeeIdByCode.set(employeeCode, saved.id);
    }

    // Pass 2: resolve DirectManagerID -> Employee.managerId now that every
    // row in this sheet has a real Employee.id.
    if (managerCol) {
      for (const row of rows) {
        const employeeCode = String(row[idCol] ?? "").trim();
        const managerCode = String(row[managerCol] ?? "").trim();
        const selfId = employeeIdByCode.get(employeeCode);
        const managerId = managerCode ? employeeIdByCode.get(managerCode) : undefined;
        if (!selfId || !managerId || managerId === selfId) continue;
        await this.prisma.employee.update({ where: { id: selfId }, data: { managerId } });
      }
    }
  }

  // Ingests one accepted Sales Calendar sheet's rows into the real
  // `sales_calendars` Postgres table (upsert by companyId+calendarDate) —
  // see schema.prisma's SalesCalendar model doc comment for why this one
  // entity is materialized instead of staying as re-parsed Excel bytes.
  // Rows whose CalendarDate can't be parsed are silently skipped, same
  // spirit as ADR-002: this is ingestion of already-structurally-valid
  // data, not another validation gate — a handful of unparsable dates
  // don't block the rest of the calendar from landing.
  private async ingestSalesCalendar(params: { companyId: string; fileId: string; headers: string[]; rows: Record<string, unknown>[] }) {
    const { companyId, fileId, headers, rows } = params;
    const headerLookup = new Map(headers.map((h) => [normalizeHeader(h), h]));
    const col = (name: string) => headerLookup.get(normalizeHeader(name));

    const dateCol = col("CalendarDate");
    if (!dateCol) return; // HEADER-001 would already have rejected this sheet — defensive only

    const dayCol = col("Day");
    const weekCol = col("Week");
    const monthCol = col("Month");
    const quarterCol = col("Quarter");
    const yearCol = col("Year");
    const workingDayCol = col("WorkingDay");
    const holidayCol = col("Holiday");
    const seasonCol = col("Season");
    const ramadanCol = col("Ramadan");
    const promotionSeasonCol = col("PromotionSeason");

    const toUpsert = rows
      .map((row) => {
        const calendarDate = toDateOrNull(row[dateCol]);
        if (!calendarDate) return null;
        return {
          companyId,
          calendarDate,
          day: dayCol ? toStringOrNull(row[dayCol]) : null,
          week: weekCol ? toIntOrNull(row[weekCol]) : null,
          month: monthCol ? toIntOrNull(row[monthCol]) : null,
          quarter: quarterCol ? toIntOrNull(row[quarterCol]) : null,
          year: yearCol ? toIntOrNull(row[yearCol]) : null,
          workingDay: workingDayCol ? toBoolOrNull(row[workingDayCol]) : null,
          holiday: holidayCol ? toStringOrNull(row[holidayCol]) : null,
          season: seasonCol ? toStringOrNull(row[seasonCol]) : null,
          ramadan: ramadanCol ? toBoolOrNull(row[ramadanCol]) : null,
          promotionSeason: promotionSeasonCol ? toStringOrNull(row[promotionSeasonCol]) : null,
          sourceFileId: fileId,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (toUpsert.length === 0) return;

    // Chunked, not one giant $transaction — a calendar can span years
    // (thousands of rows) and a single multi-thousand-statement
    // transaction risks the DB connection's statement/timeout limits.
    const CHUNK_SIZE = 500;
    for (let i = 0; i < toUpsert.length; i += CHUNK_SIZE) {
      const chunk = toUpsert.slice(i, i + CHUNK_SIZE);
      await this.prisma.$transaction(
        chunk.map((r) =>
          this.prisma.salesCalendar.upsert({
            where: { companyId_calendarDate: { companyId: r.companyId, calendarDate: r.calendarDate } },
            create: r,
            update: r,
          }),
        ),
      );
    }
  }

  // Ingests an accepted "Prospects" sheet (19th Import Template, Customer
  // Discovery Phase 2) into the real `prospects` table — upsert by
  // companyId+source(UPLOAD)+ProspectCode, so a re-upload refreshes
  // details without duplicating and WITHOUT resetting a prospect's field
  // status (visited/ignored/converted is live operational state — update
  // never touches `status`). Rows without a code or name are skipped
  // silently (ADR-002 spirit: ingestion, not a validation gate).
  private async ingestProspects(params: { companyId: string; fileId: string; headers: string[]; rows: Record<string, unknown>[] }) {
    const { companyId, fileId, headers, rows } = params;
    const headerLookup = new Map(headers.map((h) => [normalizeHeader(h), h]));
    const col = (name: string) => headerLookup.get(normalizeHeader(name));
    const codeCol = col("ProspectCode");
    const nameCol = col("ProspectName");
    if (!codeCol || !nameCol) return;
    const get = (row: Record<string, unknown>, c: string | undefined) => (c ? toStringOrNull(row[c]) : null);
    const num = (row: Record<string, unknown>, c: string | undefined) => {
      if (!c) return null;
      const n = Number(row[c]);
      return Number.isFinite(n) ? n : null;
    };
    const [channelCol, latCol, lonCol, cityCol, addressCol, phoneCol, notesCol] = ["Channel", "Latitude", "Longitude", "City", "Address", "Phone", "Notes"].map(col);

    for (const row of rows) {
      const externalKey = get(row, codeCol);
      const name = get(row, nameCol);
      if (!externalKey || !name) continue;
      const data = {
        name,
        channel: get(row, channelCol),
        lat: num(row, latCol),
        lon: num(row, lonCol),
        city: get(row, cityCol),
        address: get(row, addressCol),
        phone: get(row, phoneCol),
        notes: get(row, notesCol),
        sourceFileId: fileId,
      };
      await this.prisma.prospect.upsert({
        where: { companyId_source_externalKey: { companyId, source: "UPLOAD", externalKey } },
        create: { companyId, source: "UPLOAD", externalKey, ...data },
        update: data, // status deliberately untouched
      });
    }
  }

  // "استبدال ملف" (Replace File) — the admin-driven flow the user asked for
  // instead of the platform silently guessing which upload "is" a previous
  // one. Runs the uploaded file through the exact same batch pipeline as a
  // normal upload (full Import Validation gate, multi-sheet support
  // included), then looks specifically for whichever accepted entity in
  // that batch matches the file being replaced. Any OTHER entities the
  // same upload also contained (e.g. the admin re-uploaded the whole
  // multi-sheet master file just to refresh one) are still imported
  // normally, surfaced via `otherAccepted` — nothing extra in the upload
  // is silently discarded. Old file is deactivated (soft, same as the
  // existing `deactivate` method) — never deleted, so nothing here is data
  // loss. No active-batch-count gate: replacing/refreshing existing data
  // is an explicit admin action, not growth in how many uploads exist.
  async replaceFile(params: {
    companyId: string;
    uploadedByUserId: string;
    file: Express.Multer.File;
    oldFileId: string;
    canProvisionEmployeeAccounts: boolean;
  }): Promise<ReplaceFileOutcome> {
    const { companyId, uploadedByUserId, file, oldFileId, canProvisionEmployeeAccounts } = params;
    this.validateUpload(file, await this.getUploadSizeLimitMb(companyId));

    const oldFile = await this.prisma.file.findUnique({ where: { id: oldFileId } });
    if (!oldFile || oldFile.companyId !== companyId) throw new NotFoundException("File not found");
    if (!oldFile.isActive) throw new BadRequestException("This file is already inactive — nothing to replace.");

    const result = await this.processWorkbook({ companyId, uploadedByUserId, file, canProvisionEmployeeAccounts });

    const replacement = result.accepted.find((f) => f.datasetType === oldFile.datasetType);
    if (!replacement) {
      const rejectedMatch = result.rejected.find((r) => r.entity === oldFile.datasetType);
      if (rejectedMatch?.report) throw new ImportValidationRejectedException(rejectedMatch.report);
      throw new BadRequestException(
        `The uploaded file doesn't contain a sheet matching "${oldFile.datasetType}" (the entity being replaced). Upload a file with a sheet matching the original's template.`,
      );
    }

    // SGI's own saved file selection (Task #110's cron replay config) — the
    // one piece of per-file state left (post-ADR-001) that still needs
    // re-keying to the new file id when a daily/recurring export is
    // replaced, since it's keyed by file id rather than dataset type.
    const carryOver: ReplaceFileCarryOver = { sgiConfigUpdated: false };
    const latestSgiConfig = await this.prisma.aiReport.findFirst({
      where: { companyId, reportType: "sgi_config" },
      orderBy: { createdAt: "desc" },
    });
    if (latestSgiConfig) {
      const cfg = latestSgiConfig.content as Record<string, unknown>;
      const salesMatches = cfg.salesFileId === oldFileId;
      const collectionMatches = cfg.collectionFileId === oldFileId;
      if (salesMatches || collectionMatches) {
        await this.prisma.aiReport.create({
          data: {
            companyId,
            userId: uploadedByUserId,
            fileId: salesMatches ? replacement.id : (latestSgiConfig.fileId ?? undefined),
            reportType: "sgi_config",
            content: {
              ...cfg,
              salesFileId: salesMatches ? replacement.id : cfg.salesFileId,
              collectionFileId: collectionMatches ? replacement.id : cfg.collectionFileId,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        carryOver.sgiConfigUpdated = true;
      }
    }

    await this.prisma.file.update({ where: { id: oldFileId }, data: { isActive: false } });

    // Cleanup — the bug the user flagged: replacing a file used to leave
    // two kinds of garbage behind forever. Fix both here, best-effort (a
    // cleanup failure must never fail the replace itself — the new data is
    // already correctly in place by this point).
    //
    // 1. Materialized entities (Sales Calendar, Prospects) upsert by
    // business key, not by file — a row's `sourceFileId` gets overwritten
    // to the NEW file's id for every row still present in the new upload,
    // so any row still tagged with the OLD file's id after processWorkbook
    // ran is, by definition, one the new upload no longer contains. Purge
    // those orphans.
    if (oldFile.datasetType === SALES_CALENDAR_ENTITY) {
      await this.prisma.salesCalendar.deleteMany({ where: { companyId, sourceFileId: oldFileId } }).catch(() => undefined);
    } else if (oldFile.datasetType === PROSPECTS_ENTITY) {
      await this.prisma.prospect.deleteMany({ where: { companyId, sourceFileId: oldFileId } }).catch(() => undefined);
    }

    // 2. The old file's uploaded blob itself — never deleted before. Only
    // safe once nothing else active still points at the same storageKey
    // (a multi-sheet batch upload shares one blob across several File
    // rows, so another still-active sheet from the same upload may need
    // it).
    const stillReferenced = await this.prisma.file.count({ where: { storageKey: oldFile.storageKey, isActive: true } });
    if (stillReferenced === 0) {
      await this.storage.delete(oldFile.storageKey).catch(() => undefined);
    }

    await this.auditLogService.record({
      companyId,
      userId: uploadedByUserId,
      action: "files.replace",
      entityType: "File",
      entityId: replacement.id,
      metadata: { replacedFileId: oldFileId, replacedFileName: oldFile.fileName, ...carryOver },
    });

    return {
      file: replacement,
      carryOver,
      otherAccepted: result.accepted.filter((f) => f.id !== replacement.id),
    };
  }

  listActiveForCompany(companyId: string) {
    return this.prisma.file.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  // Used by GptModule's dataset Action endpoint — the model picks a specific
  // fileId from the active-datasets list (verify-access / GET /gpt/datasets)
  // rather than a "type", since multiple files can share a datasetType.
  // Unconfirmed classifications are excluded: the AI should never analyze a
  // dataset the platform itself hasn't finished labeling correctly.
  listConfirmedActiveForCompany(companyId: string) {
    return this.prisma.file.findMany({
      where: { companyId, isActive: true, status: "READY", datasetTypeConfirmed: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findActiveById(companyId: string, fileId: string) {
    return this.prisma.file.findFirst({
      where: { id: fileId, companyId, isActive: true, status: "READY", datasetTypeConfirmed: true },
    });
  }

  async deactivate(id: string, companyId: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.companyId !== companyId) throw new NotFoundException("File not found");
    const updated = await this.prisma.file.update({ where: { id }, data: { isActive: false } });

    // 2026-07-26 — same gap replaceFile() had (see comment there): deleting
    // a file used to leave its materialized rows (Sales Calendar, Prospects)
    // behind forever, since those two entities read straight from Postgres
    // by companyId with no awareness of file status — the AI Assistant and
    // GPT Action kept surfacing the "deleted" file's data indefinitely.
    // Unlike replaceFile() (which only purges rows the NEW upload didn't
    // re-claim), a straight delete has no replacement — purge every row
    // still tagged with this file's id, unconditionally.
    if (file.datasetType === SALES_CALENDAR_ENTITY) {
      await this.prisma.salesCalendar.deleteMany({ where: { companyId, sourceFileId: id } }).catch(() => undefined);
    } else if (file.datasetType === PROSPECTS_ENTITY) {
      await this.prisma.prospect.deleteMany({ where: { companyId, sourceFileId: id } }).catch(() => undefined);
    }

    // Same blob-cleanup gap as replaceFile() — see the comment there.
    const stillReferenced = await this.prisma.file.count({ where: { storageKey: file.storageKey, isActive: true } });
    if (stillReferenced === 0) {
      await this.storage.delete(file.storageKey).catch(() => undefined);
    }

    return updated;
  }

  async getDownloadUrl(id: string, companyId: string): Promise<string> {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.companyId !== companyId) throw new NotFoundException("File not found");
    return this.storage.getSignedDownloadUrl(file.storageKey);
  }

  // Used by GptModule's dataset Action endpoint to read the actual workbook
  // bytes for parsing (as opposed to getDownloadUrl, which is for humans).
  // Cached by storageKey — see the class-level FILE_BUFFER_CACHE comment:
  // every File row from the same batch upload shares one physical object,
  // so this avoids re-downloading identical bytes once per entity/sheet.
  async downloadFileBuffer(id: string, companyId: string): Promise<Buffer> {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.companyId !== companyId) throw new NotFoundException("File not found");

    const key = file.storageKey;
    const cached = this.bufferCache.get(key);
    if (cached) {
      this.bufferCache.delete(key);
      this.bufferCache.set(key, cached);
      return cached.buffer;
    }

    const buffer = this.storage.download(key);
    this.bufferCache.set(key, { buffer, createdAt: Date.now() });
    this.evictBufferCache();

    try {
      return await buffer;
    } catch (err) {
      const current = this.bufferCache.get(key);
      if (current?.buffer === buffer) this.bufferCache.delete(key);
      throw err;
    }
  }

  private evictBufferCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.bufferCache) {
      if (now - entry.createdAt > FILE_BUFFER_CACHE_TTL_MS) this.bufferCache.delete(key);
    }
    while (this.bufferCache.size > FILE_BUFFER_CACHE_MAX_ENTRIES) {
      const oldestKey = this.bufferCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.bufferCache.delete(oldestKey);
    }
  }

  // Plain substring search across every cell in every row of this file's
  // confirmed sheet — no column mapping needed. Built for Customer Location
  // Capture: a rep types a customer code or name, this returns the matching
  // row(s) as-is so they can visually confirm they typed the right customer
  // before a location gets saved against that code.
  async searchRows(id: string, companyId: string, query: string, limit = 10): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.companyId !== companyId) throw new NotFoundException("File not found");

    const buffer = await this.downloadFileBuffer(id, companyId);
    // 2026-07-20: same fix as ExcelDatasetEntityProvider/CanonicalHierarchyResolverService
    // — this file's storageKey may point at a large multi-sheet batch
    // workbook; restrict the parse to the one sheet this record actually
    // maps to instead of parsing every sheet in the workbook.
    const allRows = await serializeExcelParse(() => {
      const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, sheets: [file.sheetIndex] });
      const sheetName = workbook.SheetNames[file.sheetIndex];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      return (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as Record<string, unknown>[];
    });
    if (allRows.length === 0) return { headers: [], rows: [] };
    const needle = query.trim().toLowerCase();
    if (!needle) return { headers: Object.keys(allRows[0] ?? {}), rows: [] };

    const matches: Record<string, unknown>[] = [];
    for (const row of allRows) {
      const hit = Object.values(row).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(needle));
      if (hit) {
        matches.push(row);
        if (matches.length >= limit) break;
      }
    }

    const headers = ((file.parsedMetadata as { headers?: string[] } | null)?.headers) ?? Object.keys(allRows[0] ?? {});
    return { headers, rows: matches };
  }
}
