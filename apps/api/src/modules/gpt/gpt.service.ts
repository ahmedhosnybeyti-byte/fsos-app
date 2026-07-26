import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import * as argon2 from "argon2";
import * as XLSX from "xlsx";
import type { Gpt } from "@field-sales-os/database";
import { TOKEN_TTL, type ConfigureGptInput, type ExecuteReportInput, type GetGptDatasetInput, type RenderAnalysisEventInput } from "@field-sales-os/schemas";
import { PrismaService, isUniqueConstraintError } from "../../common/prisma";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { FilesService } from "../files/files.service";
import { UsageAnalyticsService } from "../usage-analytics/usage-analytics.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AnalysisEventService } from "../analysis-studio/analysis-event.service";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";
import { CanonicalHierarchyResolverService } from "../rie/canonical-hierarchy-resolver.service";
import {
  type DatasetRow,
  type DatasetSummary,
  applyHierarchyFilter,
  computeAggregate,
  filterRows,
  joinInvoiceHeaderAndItems,
  projectRow,
  resolveColumnAlias,
  resolveColumns,
  resolveExactColumn,
  resolveGroupSortField,
  sortGroups,
  sortRows,
  toDatasetSummary,
} from "../files/dataset-query.util";

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

// Filtering, aggregation, sorting, projection, and dataset-summary helpers
// all now live in ../files/dataset-query.util.ts — shared with the native
// Assistant module's query_dataset tool. Behavior here is unchanged, this
// file just imports them instead of defining them locally.

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
    private readonly hierarchyResolver: CanonicalHierarchyResolverService,
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
    if (launchToken.expiresAt < new Date()) {
      // Distinguish the two expiry cases in the message: a code that was
      // never used ran out its 10-minute paste window; a code that WAS
      // used ran out its (session-length) window — either way the fix is
      // the same (a brand new code from the dashboard), but the wording
      // should match what actually happened.
      throw new UnauthorizedException(
        launchToken.usedAt ? "This session has expired. Please generate a new Launch Code." : "This access code has expired",
      );
    }

    // 2026-07-26 — re-verifying an ALREADY-active session (same code,
    // still within its still-valid session window) is now idempotent
    // rather than an error. This is the recovery path for a real, observed
    // ChatGPT behavior: the model sometimes reports "losing" the
    // sessionToken mid-conversation even though the backend session is
    // still perfectly valid (see PROJECT_LOG.md's Layer 4 retest) —
    // previously the model's only recovery option was asking the user to
    // fetch a BRAND NEW code from the dashboard, even though the one it
    // already has is still good. Session isolation is unchanged by this:
    // it only accepts the EXACT SAME secret the user already holds, for
    // the SAME already-established session — it never falls back to any
    // OTHER session, never grants access beyond what the original
    // verifyAccess already did, and a genuinely expired code is still
    // rejected above exactly as before.
    if (!launchToken.usedAt) {
      // First-time verification: promote the one-time code into a session
      // token valid for the rest of the conversation — the model is
      // instructed to pass it back on every subsequent /gpt/dataset call.
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
    }

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
    // 2026-07-20: restrict XLSX.read to the one needed sheet — see the same
    // fix (and its full explanation) in ExcelDatasetEntityProvider.parseDatasetFromFiles.
    // Otherwise every call pays for parsing the entire (potentially
    // multi-sheet batch, tens of MB) workbook just to read one sheet.
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, sheets: Array.from(new Set([file.sheetIndex, 0])) });
    const sheetName = workbook.SheetNames[file.sheetIndex] ?? workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    const allRows = (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as DatasetRow[];
    const headers = Object.keys(allRows[0] ?? {});
    // Resolved up front so a typo'd name in `columns` fails clearly
    // regardless of aggregate/rows mode, even though projection itself only
    // applies to the rows-mode return below.
    const resolvedColumns = query.columns ? resolveColumns(headers, query.columns) : null;

    // Row-level access control (strategic point 3). This Action route
    // authenticates via API key + launch-code session, not a platform JWT,
    // so the requesting user's role/email aren't already on hand the way
    // they are in AssistantService — fetched once here instead. Same
    // enforcement as the native Assistant screen, so the old ChatGPT screen
    // can never see more than it does.
    const requestingUser = await this.prisma.user.findUnique({ where: { id: session.userId }, include: { role: true } });
    // No requestingUser should be unreachable (the session was just
    // validated), but fails closed rather than open if it ever happens.
    let visibleRows: DatasetRow[] = [];
    if (requestingUser) {
      const hierarchyUser = { roleCode: requestingUser.role.code, email: requestingUser.email };
      // ADR-001 migration: resolved the same way RIE-sourced screens do it —
      // via the company's Canonical Routes/Employees Datasets — instead of
      // this file's old manual repColumn/supervisorColumn/managerColumn +
      // Route Hierarchy Config (both removed; see FilesService).
      const routeAllowed = await this.hierarchyResolver.resolveAllowedRouteIds(gpt.companyId, hierarchyUser);
      visibleRows = applyHierarchyFilter(allRows, headers, routeAllowed);
    }

    let matchingRows = filterRows(visibleRows, headers, {
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

  // ---- POST /gpt/execute-report — unified single-call standard report ----

  // Loads one dataset by its canonical datasetType (e.g. "Invoices",
  // "Invoice Items", "Routes") rather than by fileId, since execute-report's
  // caller never sees fileIds — it only names a report type + scope. Mirrors
  // getDataset's own buffer-read/parse steps exactly (same sheet-restriction
  // fix, same shape), just keyed differently. Returns null (not throwing) for
  // "not uploaded yet" so callers can decide 404 vs empty-result themselves.
  private async loadDatasetRowsByType(companyId: string, datasetType: string): Promise<{ rows: DatasetRow[]; headers: string[] } | null> {
    const file = await this.prisma.file.findFirst({
      where: { companyId, isActive: true, status: "READY", datasetTypeConfirmed: true, datasetType },
      orderBy: { createdAt: "desc" },
    });
    if (!file) return null;

    const buffer = await this.filesService.downloadFileBuffer(file.id, companyId);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, sheets: Array.from(new Set([file.sheetIndex, 0])) });
    const sheetName = workbook.SheetNames[file.sheetIndex] ?? workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    const rows = (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as DatasetRow[];
    const headers = Object.keys(rows[0] ?? {});
    return { rows, headers };
  }

  // salesSummary is v1's only report type (Engineering Brief, 2026-07-27):
  // one scope field per request (branchId | customerId | employeeId —
  // regionId deferred), a required period, an optional groupBy. The server
  // does every step the model previously had to sequence itself
  // (getDataset -> filter -> aggregate -> renderAnalysis) in one call, so
  // there is no multi-step tool-calling sequence left for the model to get
  // wrong. branchId is resolved via Invoice.RouteID -> Routes.RouteID ->
  // Routes.BranchID — the only join of its kind in the codebase; every
  // other module reads BranchID straight off the Customers dataset instead.
  async executeReport(rawApiKey: string, sessionToken: string, input: ExecuteReportInput) {
    const { gpt, session } = await this.assertValidSession(rawApiKey, sessionToken);
    const companyId = gpt.companyId;

    const [header, items, requestingUser, currencyProfile] = await Promise.all([
      this.loadDatasetRowsByType(companyId, "Invoices"),
      this.loadDatasetRowsByType(companyId, "Invoice Items"),
      this.prisma.user.findUnique({ where: { id: session.userId }, include: { role: true } }),
      this.prisma.companyProfile.findUnique({ where: { companyId } }).catch(() => null),
    ]);
    const currency = currencyProfile?.currency?.trim() || "غير محدد";

    if (!header || !items) {
      throw new BadRequestException(
        "Invoices and Invoice Items datasets are both required for salesSummary and are not both uploaded yet. Call GET /gpt/datasets to see what's currently active.",
      );
    }

    const invoiceNoHeaderCol = resolveExactColumn(header.headers, "InvoiceNo");
    const invoiceNoItemCol = resolveExactColumn(items.headers, "InvoiceNo");
    const { rows: joinedAll } = joinInvoiceHeaderAndItems(header.rows, header.headers, invoiceNoHeaderCol, items.rows, items.headers, invoiceNoItemCol);
    const joinedHeaders = Object.keys(joinedAll[0] ?? {});

    // Row-level access control — identical enforcement to getDataset, so
    // execute-report can never surface more than the requesting user's role
    // is already allowed to see via the platform's other data paths.
    let visibleRows = joinedAll;
    if (requestingUser) {
      const hierarchyUser = { roleCode: requestingUser.role.code, email: requestingUser.email };
      const routeAllowed = await this.hierarchyResolver.resolveAllowedRouteIds(companyId, hierarchyUser);
      visibleRows = applyHierarchyFilter(joinedAll, joinedHeaders, routeAllowed);
    } else {
      visibleRows = [];
    }

    // ---- Scope resolution -------------------------------------------------
    let scopedRows = visibleRows;
    let scopeLabel: string;

    if (input.scope.customerId !== undefined) {
      const customerCol = resolveColumnAlias(joinedHeaders, "customerId");
      if (!customerCol) {
        throw new BadRequestException('No customer id/code column was found on the Invoices dataset — cannot scope by customerId.');
      }
      const exists = visibleRows.some((r) => String(r[customerCol] ?? "").trim().toLowerCase() === input.scope.customerId!.trim().toLowerCase());
      if (!exists) {
        const anyRowAtAll = joinedAll.some((r) => String(r[customerCol] ?? "").trim().toLowerCase() === input.scope.customerId!.trim().toLowerCase());
        if (!anyRowAtAll) throw new NotFoundException(`customerId "${input.scope.customerId}" was not found in the Invoices dataset.`);
        // Exists overall but not within this user's visible scope, or exists
        // but has zero invoices in the given period — both are legitimate
        // "zero" results, not a 404; the period filter below will settle it.
      }
      scopedRows = filterRows(scopedRows, joinedHeaders, { customerId: input.scope.customerId });
      scopeLabel = `العميل ${input.scope.customerId}`;
    } else if (input.scope.employeeId !== undefined) {
      // No direct EmployeeID column on Invoices/Invoice Items — resolved via
      // Routes.SalesRepID/SupervisorID/ManagerID (the same three assignment
      // columns CanonicalHierarchyResolverService itself reads), independent
      // of the requesting user's own hierarchy scope: this finds every route
      // assigned to the target employee in any of those three roles, then
      // narrows the caller's already-visible rows down to just those routes.
      const employeeId = input.scope.employeeId;
      const routesForEmployee = await this.loadDatasetRowsByType(companyId, "Routes");
      if (!routesForEmployee) {
        throw new BadRequestException("Routes dataset is required to scope by employeeId and is not uploaded yet.");
      }
      const routeIdCol = resolveExactColumn(routesForEmployee.headers, "RouteID");
      const assignmentCols = ["SalesRepID", "SupervisorID", "ManagerID"]
        .map((name) => routesForEmployee.headers.find((h) => h.toLowerCase() === name.toLowerCase()))
        .filter((c): c is string => !!c);
      const employeeRouteIds = new Set<string>();
      for (const row of routesForEmployee.rows) {
        const matches = assignmentCols.some((col) => String(row[col] ?? "").trim().toLowerCase() === employeeId.trim().toLowerCase());
        if (matches) {
          const rid = String(row[routeIdCol] ?? "").trim().toLowerCase();
          if (rid) employeeRouteIds.add(rid);
        }
      }
      if (employeeRouteIds.size === 0) {
        throw new NotFoundException(`employeeId "${employeeId}" was not found in the Routes dataset (no route assigned to this employee).`);
      }
      const routeCol = resolveColumnAlias(joinedHeaders, "routeId");
      if (!routeCol) {
        throw new BadRequestException('No RouteID column was found on the Invoices dataset — cannot scope by employeeId.');
      }
      scopedRows = visibleRows.filter((r) => {
        const v = r[routeCol];
        return v !== null && v !== undefined && employeeRouteIds.has(String(v).trim().toLowerCase());
      });
      scopeLabel = `الموظف ${employeeId}`;
    } else {
      // branchId — Invoice.RouteID -> Routes.RouteID -> Routes.BranchID.
      const branchId = input.scope.branchId!;
      const routes = await this.loadDatasetRowsByType(companyId, "Routes");
      if (!routes) {
        throw new BadRequestException("Routes dataset is required to scope by branchId and is not uploaded yet.");
      }
      const routeIdCol = resolveExactColumn(routes.headers, "RouteID");
      const branchIdCol = resolveExactColumn(routes.headers, "BranchID");
      const routeToBranch = new Map<string, string>();
      for (const r of routes.rows) {
        const rid = String(r[routeIdCol] ?? "").trim().toLowerCase();
        if (rid) routeToBranch.set(rid, String(r[branchIdCol] ?? "").trim());
      }
      const branchExists = Array.from(routeToBranch.values()).some((b) => b.toLowerCase() === branchId.trim().toLowerCase());
      if (!branchExists) {
        throw new NotFoundException(`branchId "${branchId}" was not found in the Routes dataset.`);
      }
      const invoiceRouteCol = resolveColumnAlias(joinedHeaders, "routeId");
      if (!invoiceRouteCol) {
        throw new BadRequestException('No RouteID column was found on the Invoices dataset — cannot scope by branchId.');
      }
      scopedRows = visibleRows.filter((r) => {
        const rid = String(r[invoiceRouteCol] ?? "").trim().toLowerCase();
        const b = routeToBranch.get(rid);
        return !!b && b.toLowerCase() === branchId.trim().toLowerCase();
      });
      scopeLabel = `الفرع ${branchId}`;
    }

    // ---- Period filter ------------------------------------------------------
    const invoiceDateCol = resolveExactColumn(joinedHeaders, "InvoiceDate");
    const periodRows = filterRows(scopedRows, joinedHeaders, {
      filters: { [invoiceDateCol]: { dateFrom: input.period.from, dateTo: input.period.to } },
    });

    // ---- Aggregate ------------------------------------------------------
    const lineTotalCol = resolveExactColumn(joinedHeaders, "LineTotal");
    const { value: totalSales, skippedNonNumericRows } = computeAggregate("sum", periodRows, lineTotalCol);
    const invoiceCount = new Set(periodRows.map((r) => String(r[invoiceNoHeaderCol] ?? "").trim()).filter(Boolean)).size;

    // ---- Optional groupBy breakdown ------------------------------------
    let breakdown: { groupValue: string; totalSales: number; invoiceCount: number }[] | undefined;
    if (input.groupBy) {
      const groupColumnName =
        input.groupBy === "route" ? "routeId" : input.groupBy === "customer" ? "customerId" : input.groupBy === "employee" ? "salesRep" : null;
      const groupCol = input.groupBy === "month" ? invoiceDateCol : groupColumnName ? resolveColumnAlias(joinedHeaders, groupColumnName) : null;
      if (groupCol) {
        const buckets = new Map<string, DatasetRow[]>();
        for (const row of periodRows) {
          let key: string;
          if (input.groupBy === "month") {
            const d = new Date(String(row[groupCol] ?? ""));
            key = Number.isNaN(d.getTime()) ? "(blank)" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          } else {
            const raw = row[groupCol];
            key = raw === null || raw === undefined || raw === "" ? "(blank)" : String(raw);
          }
          const bucket = buckets.get(key);
          if (bucket) bucket.push(row);
          else buckets.set(key, [row]);
        }
        breakdown = Array.from(buckets.entries())
          .map(([groupValue, rows]) => ({
            groupValue,
            totalSales: computeAggregate("sum", rows, lineTotalCol).value,
            invoiceCount: new Set(rows.map((r) => String(r[invoiceNoHeaderCol] ?? "").trim()).filter(Boolean)).size,
          }))
          .sort((a, b) => b.totalSales - a.totalSales);
      }
    }

    const narrative =
      periodRows.length === 0
        ? `لا توجد بيانات مطابقة لـ${scopeLabel} خلال الفترة من ${input.period.from} إلى ${input.period.to}.`
        : `إجمالي المبيعات لـ${scopeLabel} خلال الفترة من ${input.period.from} إلى ${input.period.to}: ${totalSales.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}، عدد الفواتير: ${invoiceCount}.`;

    const blocks: RenderAnalysisEventInput["blocks"] = [
      {
        type: "KPICards",
        id: "salesSummary-kpis",
        title: "ملخص المبيعات",
        purpose: "إجمالي المبيعات وعدد الفواتير للنطاق والفترة المطلوبة",
        payload: {
          items: [
            { label: "إجمالي المبيعات", value: `${totalSales.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}` },
            { label: "عدد الفواتير", value: invoiceCount },
          ],
        },
      },
    ];
    if (breakdown && breakdown.length > 0) {
      blocks.push({
        type: "Table",
        id: "salesSummary-breakdown",
        title: `التوزيع حسب ${input.groupBy}`,
        purpose: "تفصيل المبيعات حسب مجموعة العرض المطلوبة",
        payload: {
          columns: [
            { key: "groupValue", label: "المجموعة" },
            { key: "totalSales", label: "إجمالي المبيعات" },
            { key: "invoiceCount", label: "عدد الفواتير" },
          ],
          rows: breakdown,
        },
      });
    }

    const report = await this.analysisEventService.record({
      companyId,
      userId: session.userId,
      gptId: gpt.id,
      event: { narrative, blocks },
    });

    await this.usageAnalyticsService.recordEvent({
      companyId,
      userId: session.userId,
      gptId: gpt.id,
      eventType: "ANALYSIS_RUN",
      metadata: { reportType: input.reportType, scope: input.scope, period: input.period, groupBy: input.groupBy ?? null, totalSales, invoiceCount, skippedNonNumericRows },
    });

    return {
      reportType: input.reportType,
      scope: input.scope,
      period: input.period,
      totalSales,
      invoiceCount,
      currency,
      breakdown: breakdown ?? null,
      narrative,
      blocks,
      analysisEventId: report.id,
    };
  }
}
