import { Body, Controller, ForbiddenException, Get, Headers, Post, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  configureGptSchema,
  getGptDatasetSchema,
  renderAnalysisEventSchema,
  verifyGptAccessSchema,
  type ConfigureGptInput,
  type GetGptDatasetInput,
  type RenderAnalysisEventInput,
  type VerifyGptAccessInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { GptService } from "./gpt.service";

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

  // ---- ChatGPT Action entry points (company API-key auth) -----------------
  // @Public() bypasses the cookie-based JwtAuthGuard — these authenticate via
  // the company's static Bearer API key instead, verified inside GptService.

  @Post("verify-access")
  @Public()
  @ApiBearerAuth("gpt-api-key")
  @ApiOperation({
    summary: "Verify the user's one-time access code and start a session — call this first, always.",
    description:
      "Call first, always, before any other Action. Use the code the user pastes after \"Launch GPT\". Returns a sessionToken (send on every later call) and the active datasets list — the only valid source for \"what data\" questions and dataset metadata; never call getDataset just to inspect shape.",
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
    description: "Access verified. Carry sessionToken forward on every subsequent call for the rest of this conversation.",
    schema: jsonSchema31({
      type: "object",
      properties: {
        sessionToken: { type: "string" },
        companyName: { type: ["string", "null"] },
        datasets: { type: "array", items: datasetSummarySchema },
        sessionExpiresInHours: { type: "number" },
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
    if (!sessionToken) throw new UnauthorizedException("Missing sessionToken");
    return this.gptService.listDatasets(apiKey, sessionToken);
  }

  @Get("dataset")
  @Public()
  @ApiBearerAuth("gpt-api-key")
  @ApiOperation({
    summary: "Fetch a filtered, sorted, paginated, optionally projected page of rows from one dataset — never fetch the whole file.",
    description:
      "Always narrow with customerId, invoiceId, routeId, salesRep, search, or filters first. Use aggregate (sum/count/avg/min/max, groupBy) for figures instead of raw rows. Check columns[].distinctValues from verifyAccess/listDatasets for exact filter values. Use columns/sortBy to shape results.",
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
    if (!sessionToken) throw new UnauthorizedException("Missing sessionToken");
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
      "Call once after replying in chat, whether or not data was involved. Always pass a short narrative; add blocks only when a table/chart/map helps. Never call instead of replying, and never before the chat reply.",
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
    if (!sessionToken) throw new UnauthorizedException("Missing sessionToken");
    return this.gptService.renderAnalysis(apiKey, sessionToken, body);
  }
}
