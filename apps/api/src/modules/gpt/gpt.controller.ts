import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  configureGptSchema,
  executeReportSchema,
  getGptDatasetSchema,
  renderAnalysisEventSchema,
  verifyGptAccessSchema,
  type ConfigureGptInput,
  type ExecuteReportInput,
  type GetGptDatasetInput,
  type RenderAnalysisEventInput,
  type VerifyGptAccessInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { GptService, SESSION_RECOVERY_MESSAGE } from "./gpt.service";

function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedException("Missing or malformed Authorization header");
  }
  return authorizationHeader.slice("Bearer ".length).trim();
}

// @nestjs/swagger's ApiBody/ApiQuery/ApiResponse `schema` option is typed
// against openapi3-ts's OpenAPI-3.0-shaped SchemaObject (`nullable: true`,
// a single-string `type`) — it has no 3.1 variant. The GPT Actions document
// below is genuinely OpenAPI 3.1 (JSON Schema 2020-12: nullability is a
// `type` array), so a literal like `type: ["integer", "null"]` is exactly
// what we want emitted but doesn't fit that older type. This only widens
// the compiler's view of these object literals; the JSON produced is
// exactly what's written below, untouched by the cast.
function jsonSchema31(schema: Record<string, unknown>): any {
  return schema;
}

// Shared response shape for one dataset's metadata (see GptService's
// DatasetSummary/toDatasetSummary) — reused by verifyAccess's `datasets`
// array and listDatasets' response so the two stay identical in the docs.
//
// `columns` and `detected` (Metadata Layer, Sprint 2.2) are the model's
// only source for Stage 3 (Metadata Inspection) and Stage 4 (Column
// Resolution) of the reasoning pipeline — real per-column types/ranges and
// pre-extracted business fields, no extra call needed. Both are additive
// and nullable: files parsed before this existed simply return null here.
const columnSummarySchema = jsonSchema31({
  type: "object",
  properties: {
    name: { type: "string", description: "Real header name, exactly as it appears in this dataset." },
    type: { type: "string", enum: ["numeric", "date", "boolean", "text", "empty"] },
    nullable: { type: "boolean", description: "True if any sampled row had a blank cell in this column." },
    min: { type: ["number", "string"], description: "Numeric columns: lowest value. Date columns: earliest date (YYYY-MM-DD). Absent otherwise." },
    max: { type: ["number", "string"], description: "Numeric columns: highest value. Date columns: latest date (YYYY-MM-DD). Absent otherwise." },
    distinctValues: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "This column's actual values, present only when low-cardinality (a real enum, not free text/ids) — use these exact strings when building filters.",
    },
  },
});

const detectedSummarySchema = jsonSchema31({
  type: "object",
  description: "Smart Metadata pre-extracted at upload time — business fields the platform recognized regardless of column naming.",
  properties: {
    period: {
      type: ["object", "null"],
      properties: { from: { type: "string" }, to: { type: "string" } },
      description: "Earliest/latest date found in this dataset's date-like column, if any (YYYY-MM-DD).",
    },
    region: { type: ["array", "null"], items: { type: "string" } },
    branch: { type: ["array", "null"], items: { type: "string" } },
    salesRep: { type: ["array", "null"], items: { type: "string" } },
    route: { type: ["array", "null"], items: { type: "string" } },
  },
});

const datasetSummarySchema = jsonSchema31({
  type: "object",
  properties: {
    id: { type: "string" },
    datasetType: { type: "string" },
    fileName: { type: "string" },
    rowCount: { type: ["integer", "null"] },
    headers: { type: ["array", "null"], items: { type: "string" } },
    columns: { type: ["array", "null"], items: columnSummarySchema, description: "Per-column type/shape metadata — see Stage 3/4 of the reasoning pipeline." },
    detected: detectedSummarySchema,
  },
});

@ApiTags("gpt")
@Controller("gpt")
export class GptController {
  constructor(private readonly gptService: GptService) {}

  // ---- Company admin configuration (session auth) -------------------------

  @Get("me")
  @Auth()
  async getMine(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.gptService.findByCompany(user.companyId);
  }

  @Post("configure")
  @Auth("COMPANY_ADMIN")
  configure(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(configureGptSchema)) body: ConfigureGptInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.gptService.configure(user.companyId, body);
  }

  @Post("regenerate-key")
  @Auth("COMPANY_ADMIN")
  regenerateKey(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.gptService.regenerateApiKey(user.companyId);
  }

  // "Launch GPT" — only reachable while the guard chain confirms the
  // company's subscription is active; mints the one-time code the user
  // pastes into the chat.
  @Post("launch")
  @Auth()
  launch(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.gptService.mintLaunchCode(user.userId, user.companyId);
  }

  @Post("users/:id/reset-daily-launch-codes")
  @Auth("SUPER_ADMIN")
  resetDailyLaunchCodes(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.gptService.resetDailyLaunchCodes(id, user.userId);
  }

  // ---- ChatGPT Action entry points (company API-key auth) -----------------
  // @Public() bypasses the cookie-based JwtAuthGuard — these authenticate via
  // the company's static Bearer API key instead, verified inside GptService.

  // Architecture pivot (2026-07-27): this is now a pure access gate — it
  // confirms the user is a subscribed, authorized Field Sales OS user and
  // returns nothing resembling operational data. It's the ONLY endpoint
  // exposed to the GPT Action (see main.ts's gptActionPaths) — the model
  // has no other app-data tool to reach for. Operational analysis comes
  // exclusively from files the user uploads directly in the conversation.
  // See PROJECT_LOG.md for the decision and docs/GPT_SETUP.md for the
  // current Instructions template.
  @Post("verify-access")
  @Public()
  @ApiBearerAuth("gpt-api-key")
  @ApiOperation({
    summary: "Verify the user's access code — call this once, first, before anything else.",
    description:
      "Call first, always, before responding. Use the code the user pastes after \"Launch GPT\". This only confirms the user is authorized to use this GPT — it never returns company data. All operational analysis comes from files the user uploads in this conversation.",
  })
  @ApiBody({
    description: "The one-time access code the user pastes.",
    schema: {
      type: "object",
      properties: {
        launchCode: { type: "string", minLength: 10, description: "One-time access code from the user's dashboard." },
      },
    },
  })
  @ApiCreatedResponse({
    description: "Access verified. This confirms authorization only — it carries no company data; ask the user to upload the file(s) needed to answer their question.",
    schema: jsonSchema31({
      type: "object",
      properties: {
        verified: { type: "boolean" },
        companyName: { type: ["string", "null"] },
        role: { type: ["string", "null"], description: "The requesting user's role code, if available." },
        sessionToken: { type: "string", description: "Eight-hour session token for subsequent GPT Action requests." },
      },
    }),
  })
  verifyAccess(
    @Headers("authorization") authorization: string | undefined,
    @Body(new ZodValidationPipe(verifyGptAccessSchema)) body: VerifyGptAccessInput,
  ) {
    const apiKey = extractBearerToken(authorization);
    return this.gptService.verifyAccess(apiKey, body.launchCode ?? "");
  }

  // TODO(legacy-cleanup, 2026-07-27): keep, don't delete, per explicit user
  // decision — revisit physical removal in a dedicated cleanup task once the
  // verifyAccess-only architecture has been stable in production for a
  // while.
  //
  // Architecture pivot (2026-07-27): listDatasets/getDataset/renderAnalysis/
  // executeReport below are NOT part of the GPT Action anymore — main.ts's
  // gptActionPaths only exports verify-access, so GPT Builder never imports
  // these and the model never sees them as callable tools. They're kept
  // exactly as-is (unchanged logic, still real, still authenticated the
  // same way) for any other consumer of the full /docs schema — nothing
  // was deleted, only excluded from the GPT-scoped document.

  // Re-list active datasets mid-conversation (e.g. the model wants to
  // double-check what's available before asking the user to clarify).
  @Get("datasets")
  @Public()
  @ApiBearerAuth("gpt-api-key")
  @ApiOperation({
    summary: "List every active dataset this company has — the only valid answer to \"what data/files do I have\".",
    description:
      "Call whenever the user asks what data/files/datasets exist (e.g. \"list my files\", \"هات الملفات\"), or to refresh the list. Never answer from memory, Knowledge, or reasoning — this Action (or verifyAccess's list) is the only valid source.",
  })
  @ApiQuery({ name: "sessionToken", required: true, type: String, description: "Session token returned by verifyAccess." })
  @ApiOkResponse({
    description: "Every active, confirmed dataset currently available to this company.",
    schema: { type: "array", items: datasetSummarySchema },
  })
  listDatasets(
    @Headers("authorization") authorization: string | undefined,
    @Query("sessionToken") sessionToken: string | undefined,
  ) {
    const apiKey = extractBearerToken(authorization);
    if (!sessionToken) throw new UnauthorizedException(SESSION_RECOVERY_MESSAGE);
    return this.gptService.listDatasets(apiKey, sessionToken);
  }

  @Get("dataset")
  @Public()
  @ApiBearerAuth("gpt-api-key")
  @ApiOperation({
    summary: "Fetch a filtered, sorted, paginated, optionally projected page of rows from one dataset — never fetch the whole file.",
    description:
      "For a standard sales report (total/count/breakdown for one customer/employee/branch), call POST /gpt/execute-report instead. Use getDataset for raw rows, custom filters, or other datasets. Narrow first (customerId/invoiceId/routeId/salesRep/filters); use aggregate for figures.",
  })
  @ApiQuery({ name: "sessionToken", required: true, type: String, description: "Session token returned by verifyAccess." })
  @ApiQuery({ name: "fileId", required: true, type: String, description: "Dataset id, from verifyAccess's or listDatasets' response." })
  @ApiQuery({ name: "customerId", required: false, type: String, description: "Exact match against this dataset's customer id/code column, if it has one." })
  @ApiQuery({ name: "invoiceId", required: false, type: String, description: "Exact match against this dataset's invoice id/number column, if it has one." })
  @ApiQuery({ name: "routeId", required: false, type: String, description: "Exact match against this dataset's route id/code column, if it has one." })
  @ApiQuery({ name: "salesRep", required: false, type: String, description: "Exact match against this dataset's sales rep column, if it has one." })
  @ApiQuery({ name: "search", required: false, type: String, description: "Case-insensitive substring match across every column in a row." })
  @ApiQuery({
    name: "filters",
    required: false,
    type: String,
    description:
      'JSON object keyed by real column name from this dataset\'s headers. Each value is either a plain string for an exact match (e.g. {"Area":"North"}), or an operator object for richer conditions: dateFrom/dateTo (inclusive date range), greaterThan/greaterThanOrEqual/lessThan/lessThanOrEqual (numeric), between:[min,max] (inclusive numeric range), contains/startsWith/endsWith (case-insensitive string), in:[...] (case-insensitive membership). Multiple operators on one column AND together, e.g. {"Amount":{"greaterThanOrEqual":100,"lessThan":500},"InvoiceDate":{"dateFrom":"2026-01-01","dateTo":"2026-03-31"},"Status":{"in":["Open","Pending"]}}.',
  })
  @ApiQuery({
    name: "aggregate",
    required: false,
    type: String,
    description: 'JSON {"op":"sum"|"count"|"avg"|"min"|"max","column"?:string}. Replaces rows with a computed figure over the filtered rows.',
  })
  @ApiQuery({ name: "groupBy", required: false, type: String, description: "Real column name to group the aggregate by. Requires aggregate to be set." })
  @ApiQuery({
    name: "columns",
    required: false,
    type: String,
    description: "Comma-separated real column names, e.g. CustomerCode,CustomerName,Total. Only these fields are returned per row. Omit to get every column (default). No effect when aggregate is set.",
  })
  @ApiQuery({ name: "sortBy", required: false, type: String, description: "Real column name to sort by, executed before pagination. With aggregate+groupBy, one of groupValue/value/rowCount instead. Omit to keep default order." })
  @ApiQuery({ name: "sortDir", required: false, enum: ["asc", "desc"], description: "Sort direction, requires sortBy. Default asc." })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description:
      "Max rows (or groups, if aggregate+groupBy) to return (default 50, max 100). Exception: if you genuinely need every matching row (e.g. building a map/heatmap from all of them, not a page) and columns is set to at most 5 fields with no aggregate, limit may go up to 5000 in one call instead of looping pagination.",
  })
  @ApiQuery({ name: "offset", required: false, type: Number, description: "Rows/groups to skip, for paging past the first page (default 0)." })
  @ApiOkResponse({
    description: "Either a filtered/paginated page of rows, or (if aggregate was set) a computed figure — never both.",
    schema: jsonSchema31({
      type: "object",
      properties: {
        id: { type: "string" },
        datasetType: { type: "string" },
        fileName: { type: "string" },
        totalMatchingRows: { type: "integer", description: "Total rows matching the filters, before paging or aggregation." },
        returnedRows: { type: "integer", description: "Rows in this response. Absent when aggregate was used." },
        limit: { type: "integer" },
        offset: { type: "integer" },
        hasMore: { type: "boolean", description: "More rows/groups exist beyond this page — increase offset to continue." },
        rows: { type: "array", items: { type: "object" }, description: "Absent when aggregate was used. Each row has only the requested fields if columns was set." },
        aggregate: {
          type: "object",
          description: "Present only when the aggregate query param was set — rows/returnedRows are absent in that case.",
          properties: {
            op: { type: "string" },
            column: { type: ["string", "null"] },
            value: { type: "number", description: "Present when no groupBy." },
            rowsAggregated: { type: "integer" },
            skippedNonNumericRows: { type: "integer" },
            groupBy: { type: "string", description: "Present only when grouped." },
            totalGroups: { type: "integer", description: "Present only when grouped." },
            groups: {
              type: "array",
              description: "Present only when grouped. Sorted by value descending by default, or by sortBy/sortDir if set.",
              items: {
                type: "object",
                properties: { groupValue: { type: "string" }, value: { type: "number" }, rowCount: { type: "integer" } },
              },
            },
          },
        },
      },
    }),
  })
  getDataset(
    @Headers("authorization") authorization: string | undefined,
    @Query("sessionToken") sessionToken: string | undefined,
    @Query(new ZodValidationPipe(getGptDatasetSchema)) query: GetGptDatasetInput,
  ) {
    const apiKey = extractBearerToken(authorization);
    if (!sessionToken) throw new UnauthorizedException(SESSION_RECOVERY_MESSAGE);
    return this.gptService.getDataset(apiKey, sessionToken, query);
  }

  // The GPT calls this whenever it wants to mirror its answer into Analysis
  // Studio — a short narrative, optional visual blocks, or both. Text-only
  // (blocks: []) is a complete, valid call; the GPT should never feel
  // pressured to attach a visualization just because this action exists.
  @Post("render")
  @Public()
  @ApiBearerAuth("gpt-api-key")
  @ApiOperation({
    summary: "Mirror the answer just given in chat into the user's Analysis Studio screen — call after every reply, not instead of it.",
    description:
      "Call once after replying in chat. Pass a short narrative; add blocks only if helpful. Never call instead of replying or before it. Do NOT use for a standard sales report (no data access) — call POST /gpt/execute-report instead, which fetches data AND records this event in one call.",
  })
  @ApiQuery({ name: "sessionToken", required: true, type: String, description: "Session token returned by verifyAccess." })
  @ApiBody({
    description: "The narrative text and/or visual blocks to render.",
    schema: {
      type: "object",
      properties: {
        narrative: { type: "string", maxLength: 4000 },
        blocks: {
          type: "array",
          maxItems: 10,
          default: [],
          items: {
            type: "object",
            required: ["type", "id"],
            properties: {
              type: { type: "string", description: "e.g. KPICards, Table, HtmlArtifact — see the system prompt for the current set." },
              id: { type: "string" },
              title: { type: "string" },
              purpose: { type: "string", description: "Why this block exists — required so nothing decorative ships." },
              sourceDatasetIds: { type: "array", items: { type: "string" } },
              payload: { description: "Block-type-specific data." },
            },
          },
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: "Confirms the event was recorded in Analysis Studio.",
    schema: { type: "object", properties: { received: { type: "boolean" }, eventId: { type: "string" } } },
  })
  renderAnalysis(
    @Headers("authorization") authorization: string | undefined,
    @Query("sessionToken") sessionToken: string | undefined,
    @Body(new ZodValidationPipe(renderAnalysisEventSchema)) body: RenderAnalysisEventInput,
  ) {
    const apiKey = extractBearerToken(authorization);
    if (!sessionToken) throw new UnauthorizedException(SESSION_RECOVERY_MESSAGE);
    return this.gptService.renderAnalysis(apiKey, sessionToken, body);
  }

  // Unified, single-call standard report — built specifically to remove the
  // multi-step tool-calling sequence (getDataset -> renderAnalysis) that a
  // GPT conversation doesn't always execute correctly. The model sends only
  // report type + scope + period; the server loads, joins, filters,
  // aggregates, applies row-level access control, AND records the Analysis
  // Studio event itself — the response already contains everything needed
  // to answer the user, no follow-up Action call required.
  @Post("execute-report")
  @Public()
  @ApiBearerAuth("gpt-api-key")
  @ApiOperation({
    summary: "Run a standard sales report for one scope + period in a single call — the preferred way to answer sales-total questions.",
    description:
      "Use for total sales, invoice count, or a breakdown for ONE customer, employee, or branch over a date range. Provide exactly one of scope.customerId/employeeId/branchId, period.from/to, optional groupBy. Fetches data and records Analysis Studio in one call — skip renderAnalysis.",
  })
  @ApiBody({
    description: "Report type, scope (exactly one field), period, and optional groupBy.",
    schema: jsonSchema31({
      type: "object",
      required: ["reportType", "scope", "period"],
      properties: {
        reportType: { type: "string", enum: ["salesSummary"] },
        scope: {
          type: "object",
          description: "Exactly one of these three fields.",
          properties: {
            branchId: { type: "string" },
            customerId: { type: "string" },
            employeeId: { type: "string" },
          },
        },
        period: {
          type: "object",
          required: ["from", "to"],
          properties: {
            from: { type: "string", description: "Inclusive start date (YYYY-MM-DD)." },
            to: { type: "string", description: "Inclusive end date (YYYY-MM-DD)." },
          },
        },
        groupBy: {
          type: "string",
          enum: ["route", "employee", "customer", "month"],
          description:
            'Turns the single totalSales/invoiceCount figure into a "breakdown" array, one entry per group, sorted by totalSales descending — already the ranking, no extra step needed. Examples: top customers for one employee -> scope.employeeId + groupBy="customer" (the breakdown IS the top-customers list); monthly sales trend -> groupBy="month"; sales by customer -> groupBy="customer"; sales by route -> groupBy="route". Do not call getDataset to answer these — this endpoint already returns the grouped, sorted result in one call.',
        },
      },
    }),
  })
  @ApiQuery({
    name: "sessionToken",
    required: true,
    type: String,
    description:
      "Session token returned by verifyAccess. If unavailable or expired, automatically call verify-access again using the same launchCode already provided earlier in this conversation, then retry this report. Do not ask the user for a new code unless re-verification with the same code fails.",
  })
  @ApiCreatedResponse({
    description: "Computed report — reply to the user using narrative/totalSales/invoiceCount directly; already recorded in Analysis Studio.",
    schema: jsonSchema31({
      type: "object",
      properties: {
        reportType: { type: "string" },
        scope: { type: "object" },
        period: { type: "object" },
        totalSales: { type: "number" },
        invoiceCount: { type: "integer" },
        currency: { type: "string" },
        breakdown: { type: ["array", "null"], items: { type: "object", properties: { groupValue: { type: "string" }, totalSales: { type: "number" }, invoiceCount: { type: "integer" } } } },
        narrative: { type: "string" },
        blocks: { type: "array", items: { type: "object" } },
        analysisEventId: { type: "string" },
      },
    }),
  })
  executeReport(
    @Headers("authorization") authorization: string | undefined,
    @Query("sessionToken") sessionToken: string | undefined,
    @Body(new ZodValidationPipe(executeReportSchema)) body: ExecuteReportInput,
  ) {
    const apiKey = extractBearerToken(authorization);
    if (!sessionToken) throw new UnauthorizedException(SESSION_RECOVERY_MESSAGE);
    return this.gptService.executeReport(apiKey, sessionToken, body);
  }
}
