import { BadRequestException, Injectable } from "@nestjs/common";
import {
  analysisBlockSchema,
  ASSISTANT_LIMITS,
  type AnalysisBlock,
  type AggregateSpec,
  type AssistantChatRequest,
  type AssistantChatResponse,
  type FilterOperatorSpec,
} from "@field-sales-os/schemas";
import { AppConfigService } from "../../common/config/app-config.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { CANONICAL_ENTITIES } from "../rie/canonical-entities.data";
import { SgiService } from "../sgi/sgi.service";
import {
  type DatasetRow,
  computeAggregate,
  filterRows,
  projectRow,
  resolveColumns,
  resolveExactColumn,
  resolveGroupSortField,
  sortGroups,
  sortRows,
} from "../files/dataset-query.util";
import { CORE_DNA_SYSTEM_PROMPT } from "./data/dna-core-prompt";
import { formatScenarios, retrieveScenarios } from "./data/scenario-retrieval.util";

// Native, in-app replacement for the external ChatGPT Custom GPT screen.
// Same job the GPT Actions (verify-access / dataset / render, see
// gpt.service.ts, deliberately kept intact/untouched — see completion
// report) did for ChatGPT — give the model real, scoped access to the
// company's data and a way to push rich blocks into the UI — but as a
// Claude tool-use loop running server-side in one request, no external
// redirect or launch-code handshake needed.
//
// Migration #9 (ADR-001 / RIE Migration Plan, 2026-07-19) — list_datasets/
// query_dataset now read via RieFacade against the 19 Canonical Entities
// instead of an arbitrary uploaded fileId + raw XLSX parsing. Hierarchy
// Row-Level Filtering is applied INSIDE RieFacade.getEntityRecords itself
// (see ExcelDatasetEntityProvider.resolveAllowedRouteIds) — this service no
// longer calls applyHierarchyFilter/getRouteAllowedValues manually. Trade-
// off disclosed in the completion report: the model can only query the 19
// Canonical Entities now, not an arbitrary non-canonical uploaded file —
// accepted deliberately per the product owner's "قضي على تحديد الجداول
// والأعمدة من كل الشاشات" decision.
//
// Token economy (per the user's explicit "توكين اقتصادية" requirement):
//   - claude-haiku-4-5, same model already used for Heat Map interpret()
//     and the Geo Intelligence talking-points endpoints.
//   - Prompt caching (cache_control on the system block) — the condensed
//     DNA prompt + tool schemas are static per conversation, so repeat
//     turns in the same session aren't billed full price for them again.
//   - The 153-scenario Behavior Scenario Library is never sent whole —
//     only the ~5 closest-matching scenarios per user message (keyword
//     overlap, computed in-process, no embeddings/vector DB).
//   - query_dataset never returns more than MAX_ROWS_RETURNED_TO_MODEL
//     rows — the model narrows its own query (filters/aggregate) instead
//     of the backend ever dumping a large page into context.
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_ITERATIONS = 6;
const MAX_ROWS_RETURNED_TO_MODEL = 60;
const MAX_TOKENS = 1500;

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[] | Array<{ type: "tool_result"; tool_use_id: string; content: string }>;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
  stop_reason: string;
}

// Anthropic tool-use JSON schemas — deliberately hand-written (not derived
// from the zod schemas) since Anthropic's tools[].input_schema is plain
// JSON Schema, and these three tools have no REST-facing counterpart of
// their own to share a definition with.
const TOOLS = [
  {
    name: "list_datasets",
    description:
      "يرجع قائمة بالكيانات الكانونية (Canonical Entities) المتاحة فعليًا للشركة الحالية (عملاء، فواتير، زيارات، مسارات...)، مع أسماء الحقول الفعلية لكل كيان. استخدمها أول خطوة في أي تحليل يحتاج بيانات حقيقية، أو لو احتجت تعرف الكيانات المتاحة أو أسماء حقولها الفعلية.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "query_dataset",
    description:
      "يفلتر و/أو يجمع و/أو يرتب صفوف كيان كانوني واحد ويرجع نتيجة صغيرة فقط (رقم مجمّع أو صفحة محدودة من الصفوف) — لا يرجع الكيان كامل أبدًا. استخدمها لأي سؤال يحتاج رقمًا أو قائمة حقيقية من بيانات الشركة. نادِها أكثر من مرة بفلاتر مختلفة لو احتجت.",
    input_schema: {
      type: "object",
      properties: {
        entityName: { type: "string", description: 'اسم الكيان الكانوني كما ورد من list_datasets، مثل "Customers" أو "Invoice Items"' },
        customerId: { type: "string" },
        invoiceId: { type: "string" },
        routeId: { type: "string" },
        salesRep: { type: "string" },
        search: { type: "string", description: "بحث نصي حر في كل أعمدة الصف" },
        filters: {
          type: "object",
          description:
            'مطابقة دقيقة بالصيغة {"اسم العمود": "قيمة"}، أو عامل مقارنة مثل {"اسم العمود": {"greaterThan": 500}}. عوامل متاحة: greaterThan, greaterThanOrEqual, lessThan, lessThanOrEqual, between:[min,max], contains, startsWith, endsWith, in:[...], dateFrom, dateTo.',
          additionalProperties: true,
        },
        aggregate: {
          type: "object",
          description: 'احسب رقمًا واحدًا بدل إرجاع صفوف، مثال {"op":"sum","column":"Total"}. column غير مطلوب لو op="count".',
          properties: {
            op: { type: "string", enum: ["sum", "count", "avg", "min", "max"] },
            column: { type: "string" },
          },
          required: ["op"],
        },
        groupBy: { type: "string", description: "اسم عمود لتجميع aggregate حسب قيمه المميزة (يتطلب توفر aggregate)" },
        columns: { type: "array", items: { type: "string" }, description: "أسماء أعمدة محددة فقط للإرجاع بدل كل الأعمدة" },
        sortBy: { type: "string", description: "اسم عمود للترتيب، أو groupValue/value/rowCount عند استخدام groupBy" },
        sortDir: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "number", description: `حد أقصى ${MAX_ROWS_RETURNED_TO_MODEL} صف/مجموعة في كل نداء` },
        offset: { type: "number" },
      },
      required: ["entityName"],
      additionalProperties: false,
    },
  },
  {
    name: "get_sales_growth_situations",
    description:
      'يرجع آخر نتيجة محسوبة من محرك Sales Growth Intelligence: التقدم نحو الهدف الشهري (المحقق مقابل المستهدف)، وقائمة "مواقف" مصنّفة بالأولوية (عالية/متوسطة/منخفضة) — عملاء توقفوا عن الشراء فجأة، عملاء في تراجع، عملاء خاملون من فترة طويلة، عملاء عندهم مبلغ تحصيل معلّق، ومناديب/مناطق متأخرة عن هدف الشهر. كل موقف يتضمن توصية جاهزة للتنفيذ. استخدمها لأي سؤال عن الفرص، المخاطر، التقدم نحو الهدف، أو "مين محتاج متابعة النهارده؟" — لا تحاول حساب هذه الأشياء يدويًا عبر query_dataset. النتيجة محسوبة مسبقًا (ليست لحظية) وقد تكون فارغة لو محدش شغّل الحساب لهذه الشركة بعد.',
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "render_block",
    description:
      "اعرض جدولاً أو بطاقات مؤشرات (KPI) أو خريطة HTML مباشرة داخل الشات بدل كتابتها كنص خام. استخدمها كل ما كانت النتيجة (عدة صفوف/أصناف/عملاء أو أرقام رئيسية) أنسب للعرض المرئي من الفقرة النصية.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: 'نوع البلوك: "KPICards" لبطاقات أرقام، "Table" لجدول بيانات، "HtmlArtifact" لخريطة أو رسم HTML كامل.',
        },
        id: { type: "string", description: "معرف قصير فريد لهذا البلوك" },
        title: { type: "string" },
        purpose: { type: "string", description: "جملة قصيرة توضح لماذا هذا البلوك موجود وما السؤال التجاري الذي يجيب عنه" },
        sourceDatasetIds: { type: "array", items: { type: "string" } },
        payload: {
          type: "object",
          description:
            'شكل البيانات حسب النوع. Table: {"columns":[{"key":"...","label":"..."}],"rows":[{...}]}. KPICards: {"items":[{"label":"...","value":"...","delta":"..."}]}. HtmlArtifact: {"html":"<div>...</div>"}.',
        },
      },
      required: ["type", "id", "payload"],
      additionalProperties: false,
    },
  },
] as const;

@Injectable()
export class AssistantService {
  constructor(
    private readonly rieFacade: RieFacade,
    private readonly appConfig: AppConfigService,
    private readonly sgiService: SgiService,
  ) {}

  // Every RIE read in this service must pass requestingUser — see the
  // identical comment in geo-intelligence.service.ts. Centralizes Hierarchy
  // Row-Level Filtering so every call site here gets it the same way.
  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  async chat(user: AuthenticatedUser, input: AssistantChatRequest): Promise<AssistantChatResponse> {
    const companyId = user.companyId!;
    const apiKey = this.appConfig.values.anthropic.apiKey;
    if (!apiKey) {
      throw new BadRequestException("المساعد يحتاج ANTHROPIC_API_KEY مضبوط على السيرفر. راجع فريقك التقني لضبطه في متغيرات البيئة.");
    }

    const today = new Date().toISOString().slice(0, 10);
    const scenarioBlock = formatScenarios(retrieveScenarios(input.message));
    const systemPrompt = `${CORE_DNA_SYSTEM_PROMPT}\n\nتاريخ اليوم: ${today}.${scenarioBlock}`;

    const messages: ClaudeMessage[] = [
      ...input.history.slice(-ASSISTANT_LIMITS.maxHistoryMessages).map((m): ClaudeMessage => ({ role: m.role, content: m.content })),
      { role: "user", content: input.message },
    ];

    const blocks: AnalysisBlock[] = [];
    let finalText = "";

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.callClaude(apiKey, systemPrompt, messages);
      const toolUseBlocks = response.content.filter((b): b is Extract<ClaudeContentBlock, { type: "tool_use" }> => b.type === "tool_use");
      const textBlocks = response.content.filter((b): b is Extract<ClaudeContentBlock, { type: "text" }> => b.type === "text");
      const text = textBlocks
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) finalText = text;

      if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") break;

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
      for (const toolUse of toolUseBlocks) {
        const result = await this.executeTool(user, toolUse.name, toolUse.input, blocks);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return { reply: finalText || "معرفتش أوصل لإجابة واضحة، جرب تصيغ سؤالك بشكل مختلف.", blocks };
  }

  private async callClaude(apiKey: string, systemPrompt: string, messages: ClaudeMessage[]): Promise<ClaudeResponse> {
    let response: globalThis.Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: MAX_TOKENS,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          tools: TOOLS,
          messages,
        }),
      });
    } catch {
      throw new BadRequestException("تعذر الاتصال بالمساعد، حاول تاني.");
    }
    if (!response.ok) {
      // 2026-07-20: surface Anthropic's actual error body instead of just
      // the HTTP status — "فشل طلب المساعد (400)" alone gives no way to
      // tell an invalid/expired API key apart from a malformed request
      // body apart from a rate limit, all of which return 400/401/429 with
      // a JSON body shaped { error: { type, message } }. Read as text first
      // (not .json()) so a non-JSON error page (e.g. a proxy 502) doesn't
      // throw its own unrelated parse error and mask the real one.
      const rawBody = await response.text().catch(() => "");
      let detail = rawBody;
      try {
        const parsed = JSON.parse(rawBody) as { error?: { type?: string; message?: string } };
        if (parsed.error?.message) detail = `${parsed.error.type ?? ""} ${parsed.error.message}`.trim();
      } catch {
        // not JSON — keep rawBody as-is
      }
      throw new BadRequestException(`فشل طلب المساعد (${response.status})${detail ? `: ${detail}` : "."}`);
    }
    return (await response.json()) as ClaudeResponse;
  }

  private async executeTool(user: AuthenticatedUser, name: string, input: unknown, blocks: AnalysisBlock[]): Promise<unknown> {
    try {
      if (name === "list_datasets") {
        return { entities: await this.listAvailableEntities(user) };
      }
      if (name === "query_dataset") {
        return await this.queryDataset(user, input);
      }
      if (name === "get_sales_growth_situations") {
        return await this.getSalesGrowthSituations(user);
      }
      if (name === "render_block") {
        const parsed = analysisBlockSchema.safeParse(input);
        if (!parsed.success) return { error: "بيانات البلوك غير صالحة: " + parsed.error.issues.map((i) => i.message).join("; ") };
        blocks.push(parsed.data);
        return { rendered: true };
      }
      return { error: `أداة غير معروفة: ${name}` };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "حصل خطأ غير متوقع أثناء تنفيذ الأداة." };
    }
  }

  // Thin passthrough to SgiService.getLatest — visibility narrowing
  // (SALES_REP/SUPERVISOR only see their own situations) already happens
  // inside that call, same as every other tool here only ever sees what
  // this user is allowed to see. Trimmed to just the fields worth spending
  // tokens on; internal ids/ownerRepEmail (used server-side for filtering,
  // not for display) are dropped before this goes to the model.
  private async getSalesGrowthSituations(user: AuthenticatedUser): Promise<unknown> {
    const latest = await this.sgiService.getLatest(user);
    if (!latest) {
      return { available: false, reason: "لسه محدش شغّل حساب SGI لهذه الشركة." };
    }
    return {
      available: true,
      generatedAt: latest.generatedAt,
      periodMonth: latest.periodMonth,
      // Same opening summary the Sales Growth screen shows verbatim —
      // generated once by SgiService, not by this service. If the user is
      // just asking for an overview/priorities, relay this text (or a light
      // paraphrase) instead of composing a fresh summary from the raw
      // situations below.
      briefing: latest.briefing,
      monthlyGoal: latest.summary.monthlyGoal,
      totalSituations: latest.summary.totalSituations,
      highSeverityCount: latest.summary.highSeverityCount,
      warnings: latest.warnings,
      situations: latest.situations.map((s) => ({
        type: s.type,
        severity: s.severity,
        entity: s.entityLabel,
        title: s.title,
        detail: s.detail,
        recommendation: s.recommendation,
      })),
    };
  }

  // Migration #9 — every one of the 19 Canonical Entities is checked in
  // parallel with limit:1 (cheap: just needs availability + field names for
  // tool-planning, not full row data). Entities RIE has no data-source
  // mapping for at all (Companies, Regions, ...) simply come back
  // unavailable and are filtered out, same as any other RIE consumer.
  private async listAvailableEntities(user: AuthenticatedUser): Promise<Array<{ entityName: string; fields: string[] }>> {
    const ctx = this.rieContext(user);
    const results = await Promise.all(
      CANONICAL_ENTITIES.map(async (entity) => {
        const result = await this.rieFacade.getEntityRecords(entity.entityName, { ...ctx, limit: 1 });
        return result.available ? { entityName: entity.entityName, fields: [...result.fields] } : null;
      }),
    );
    return results.filter((r): r is { entityName: string; fields: string[] } => r !== null);
  }

  private async queryDataset(user: AuthenticatedUser, raw: unknown): Promise<unknown> {
    const input = raw as {
      entityName?: string;
      customerId?: string;
      invoiceId?: string;
      routeId?: string;
      salesRep?: string;
      search?: string;
      filters?: Record<string, string | FilterOperatorSpec>;
      aggregate?: { op: AggregateSpec["op"]; column?: string };
      groupBy?: string;
      columns?: string[];
      sortBy?: string;
      sortDir?: "asc" | "desc";
      limit?: number;
      offset?: number;
    };
    if (!input.entityName) return { error: "entityName مطلوب." };

    // Migration #9 — RieFacade.getEntityRecords already applies Hierarchy
    // Row-Level Filtering internally (ExcelDatasetEntityProvider), so no
    // manual applyHierarchyFilter/getRouteAllowedValues call is needed here
    // anymore — every RIE consumer in the app gets this the same way now.
    const result = await this.rieFacade.getEntityRecords(input.entityName, this.rieContext(user));
    if (!result.available) {
      return { error: `الكيان "${input.entityName}" غير متاح لهذه الشركة. استخدم list_datasets للحصول على قائمة صحيحة.` };
    }

    const allRows = result.records as DatasetRow[];
    const headers = [...result.fields];

    let matchingRows: DatasetRow[];
    try {
      matchingRows = filterRows(allRows, headers, {
        customerId: input.customerId,
        invoiceId: input.invoiceId,
        routeId: input.routeId,
        salesRep: input.salesRep,
        search: input.search,
        filters: input.filters,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "فلتر غير صالح." };
    }

    const limit = Math.min(Math.max(input.limit ?? 20, 1), MAX_ROWS_RETURNED_TO_MODEL);
    const offset = Math.max(input.offset ?? 0, 0);
    const sortDir = input.sortDir ?? "asc";

    if (input.aggregate) {
      let column: string | undefined;
      try {
        column = input.aggregate.column ? resolveExactColumn(headers, input.aggregate.column) : undefined;
      } catch (err) {
        return { error: err instanceof Error ? err.message : "عمود غير صالح." };
      }

      if (input.groupBy) {
        let groupColumn: string;
        try {
          groupColumn = resolveExactColumn(headers, input.groupBy);
        } catch (err) {
          return { error: err instanceof Error ? err.message : "عمود التجميع غير صالح." };
        }
        const rowsByGroup = new Map<string, DatasetRow[]>();
        for (const row of matchingRows) {
          const rawVal = row[groupColumn];
          const key = rawVal === null || rawVal === undefined || rawVal === "" ? "(blank)" : String(rawVal);
          const bucket = rowsByGroup.get(key);
          if (bucket) bucket.push(row);
          else rowsByGroup.set(key, [row]);
        }
        let allGroups = Array.from(rowsByGroup.entries())
          .map(([groupValue, rows]) => ({ groupValue, rowCount: rows.length, ...computeAggregate(input.aggregate!.op, rows, column) }))
          .sort((a, b) => b.value - a.value);
        if (input.sortBy) {
          try {
            allGroups = sortGroups(allGroups, resolveGroupSortField(input.sortBy), sortDir);
          } catch (err) {
            return { error: err instanceof Error ? err.message : "ترتيب غير صالح." };
          }
        }
        const groupPage = allGroups.slice(offset, offset + limit);
        return {
          totalMatchingRows: matchingRows.length,
          totalGroups: allGroups.length,
          limit,
          offset,
          hasMore: offset + groupPage.length < allGroups.length,
          groups: groupPage,
        };
      }

      const result = computeAggregate(input.aggregate.op, matchingRows, column);
      return { totalMatchingRows: matchingRows.length, aggregate: { op: input.aggregate.op, column: column ?? null, ...result } };
    }

    let sortedRows = matchingRows;
    if (input.sortBy) {
      try {
        sortedRows = sortRows(matchingRows, resolveExactColumn(headers, input.sortBy), sortDir);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "ترتيب غير صالح." };
      }
    }

    const page = sortedRows.slice(offset, offset + limit);
    let resolvedColumns: string[] | null = null;
    if (input.columns && input.columns.length > 0) {
      try {
        resolvedColumns = resolveColumns(headers, input.columns);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "أعمدة غير صالحة." };
      }
    }
    const rows = resolvedColumns ? page.map((row) => projectRow(row, resolvedColumns!)) : page;

    return {
      totalMatchingRows: matchingRows.length,
      returnedRows: rows.length,
      limit,
      offset,
      hasMore: offset + rows.length < matchingRows.length,
      rows,
    };
  }
}
