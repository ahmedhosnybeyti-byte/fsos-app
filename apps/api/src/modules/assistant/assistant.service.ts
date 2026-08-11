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
  resolveColumnAlias,
  resolveColumns,
  resolveExactColumn,
  resolveGroupSortField,
  sortGroups,
  sortRows,
} from "../files/dataset-query.util";
import { CORE_DNA_SYSTEM_PROMPT } from "./data/dna-core-prompt";
import { formatScenarios, retrieveScenarios } from "./data/scenario-retrieval.util";
import { resolveMentionedCustomer } from "../local-decision/dictionary-engine";
import { resolveEntity, type ChatTurn, type EntityResolver } from "../local-decision/entity-resolution";
import { buildEmployeeResolver, type EmployeeResolverAuth } from "../local-decision/resolvers/employee.resolver";
import { buildBranchResolver, buildRegionResolver, type OrgUnitLike, type OrgUnitResolverAuth } from "../local-decision/resolvers/org-unit.resolver";
import { OrgUnitsService } from "../companies/org-units.service";
import { dispatchIntent } from "../local-decision/intent-dispatcher";
import { PrismaService } from "../../common/prisma";

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

// 2026-07-26 token-bloat fix (615k-token "prompt is too long" incident) —
// two independent uncapped-growth sources found in the tool-use loop:
//
// 1. query_dataset had a row-count cap (MAX_ROWS_RETURNED_TO_MODEL) but no
//    cap on ROW WIDTH or FIELD LENGTH — if the model omitted `columns`
//    (never enforced), every column of a wide canonical entity came back
//    for all 60 rows, and any long free-text field multiplied that further.
// 2. The tool-use loop resends the ENTIRE growing `messages` array on every
//    iteration (required by Anthropic's protocol), but nothing ever shrank
//    OLDER tool_result content once the model had already consumed it —
//    so a single big query_dataset payload got re-billed/re-sent in full on
//    every subsequent iteration, compounding across up to
//    MAX_TOOL_ITERATIONS turns (classic O(n^2) growth within one request).
//
// Fixes below address exactly these two, and only these two — no tool
// behavior, tool selection, or response content visible to the user
// changes. A normal query_dataset call (the vast majority of real usage)
// never even touches these limits.
const MAX_TOOL_RESULT_CHARS = 12000; // ~3k-token ceiling on a single query_dataset payload
const MAX_FIELD_CHARS = 300; // per-field string truncation inside returned rows
const STALE_TOOL_RESULT_CHARS = 200; // below this, compaction isn't worth the risk/complexity
const STALE_TOOL_RESULT_PLACEHOLDER = JSON.stringify({
  note: "نتيجة سابقة تم استخدامها بالفعل في هذا الحوار — غير معروضة هنا لتوفير المساحة. نادِ الأداة تاني لو احتجت البيانات دي تاني.",
});

// Truncates long string field values so a single verbose/free-text column
// can't blow the token budget on its own, then — belt-and-braces — drops
// trailing rows if the page is still too large even after truncation
// (very wide entities with many columns). Only ever shrinks; never
// changes which rows/columns were selected by the query logic above.
function capRowsForModel(rows: DatasetRow[]): DatasetRow[] {
  const trimmed = rows.map((row) => {
    const out: DatasetRow = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = typeof value === "string" && value.length > MAX_FIELD_CHARS ? `${value.slice(0, MAX_FIELD_CHARS)}…` : value;
    }
    return out;
  });
  let result = trimmed;
  while (result.length > 1 && JSON.stringify(result).length > MAX_TOOL_RESULT_CHARS) {
    result = result.slice(0, Math.ceil(result.length / 2));
  }
  return result;
}

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
  {
    // Structured Response Contract (client architecture decision,
    // 2026-07-26) — the model MUST finish every turn by calling this tool
    // instead of replying with free text. This is what makes analysis /
    // advice / decision a server-enforced contract instead of a prompt
    // instruction the model might drift from: the server only ever reads
    // the reply from this tool's validated input, never from raw prose.
    name: "submit_structured_reply",
    description:
      'أنهِ ردك دائمًا بنداء هذه الأداة بدل كتابة نص حر. "analysis" إلزامي دائمًا (نتيجة السؤال بالأرقام/الحقائق). "advice" و"decision" اختياريان — أرجعهما null صراحة إذا كان السؤال مباشرًا ولا يستدعي نصيحة أو قرارًا فعليًا؛ لا تملأهما بحشو غير مفيد فقط لإكمال الحقول.',
    input_schema: {
      type: "object",
      properties: {
        analysis: { type: "string", description: "التحليل أو الإجابة الأساسية على السؤال — إلزامي دائمًا." },
        advice: { type: ["string", "null"], description: "نصيحة عملية إذا كانت ذات قيمة حقيقية، وإلا null." },
        decision: { type: ["string", "null"], description: "قرار أو توصية محددة إذا كانت ذات قيمة حقيقية، وإلا null." },
      },
      required: ["analysis", "advice", "decision"],
      additionalProperties: false,
    },
  },
] as const;

const STRUCTURED_REPLY_TOOL_NAME = "submit_structured_reply";

@Injectable()
export class AssistantService {
  constructor(
    private readonly rieFacade: RieFacade,
    private readonly appConfig: AppConfigService,
    private readonly sgiService: SgiService,
    private readonly orgUnitsService: OrgUnitsService,
    private readonly prisma: PrismaService,
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

    // FDA Local Decision Layer — Dictionary Engine, tried before the Claude
    // loop starts. This is NOT a final zero-AI answer (Smart Assistant has
    // no fixed-field briefing object to answer from the way Visit Copilot
    // does) — it only resolves a customer the user named by code/name in
    // free text against the same hierarchy-scoped Customers rows Permission
    // Check would already narrow, and injects that resolution as context so
    // the model doesn't have to spend a query_dataset round-trip figuring
    // out which customer "he"/"this client" refers to. Failure to resolve
    // (or an RIE read error) must never block the chat — falls back to
    // silence, exactly as if this step didn't run.
    let mentionedCustomerLine = "";
    try {
      // getEntityRecords returns an EntityQueryResult wrapper (available +
      // records + fields), not a bare array — same shape VisitCopilotService
      // reads via its own requireCustomers() helper. `available: false` (no
      // Customers dataset uploaded yet) is treated the same as any other
      // resolution failure here: silently skip, never block the chat.
      const result = await this.rieFacade.getEntityRecords("Customers", this.rieContext(user));
      if (result.available) {
        const mentioned = resolveMentionedCustomer(input.message, result.records);
        if (mentioned) {
          mentionedCustomerLine = `\n\nملاحظة سياق (تم تحديدها محليًا بدون AI): رسالة المستخدم تذكر العميل "${mentioned.customerName}" (الكود: ${mentioned.customerCode}). إذا كان سؤال المستخدم عن عميل، استخدم هذا الكود مباشرة بدل تخمين الاسم أو البحث عنه.`;
        }
      }
    } catch {
      // Best-effort only — Dictionary Engine resolution is an optimization,
      // never a hard dependency of the chat loop.
    }

    // FDA Local Decision Layer — Entity Resolution (client architecture
    // decision, 2026-07-26): a question that NEEDS an entity (salesperson,
    // branch, region) but doesn't name one must be resolved deterministically
    // — explicit mention, then most recent mention in conversation history,
    // then self-context/unique-scope — or refused with a local clarification.
    // It must NEVER be handed to AI to guess or ask its own follow-up; that
    // is this layer's job, not the model's. Unlike the Customer block above
    // (a silent optimization), an ambiguous result HERE genuinely stops the
    // turn before any Claude call — see the early return below.
    //
    // Scope: only entities with a real, non-invented data path are wired in
    // (Employee/Salesperson via the Employees Canonical Entity; Branch/
    // Region via OrgUnitsService — Customer is handled by the Dictionary
    // Engine step above and needs no self-context). Triggered only when the
    // message contains an exact keyword for one of these entity *types*
    // without also containing something the corresponding resolver's
    // findMention already recognizes as a specific mention — consistent
    // with Rule Engine's "exact keyword/pattern matching only" philosophy,
    // not a general intent classifier.
    const entityResolutionResult = await this.tryResolveNeededEntity(user, input);
    if (entityResolutionResult) {
      return { analysis: entityResolutionResult, advice: null, decision: null, blocks: [] };
    }

    // FDA Local Decision Layer — Intent Dispatcher (Task Station, 2026-07-26,
    // wired into chat() per the follow-up Task Brief). Runs after the
    // Customer Dictionary Engine and Entity Resolution blocks above — those
    // two either enrich context silently or must stop the turn on ambiguity;
    // this step answers a small, fixed set of fully-local business questions
    // outright before any Claude call, and only for intents already vetted
    // as canAnswerLocally:"yes" in assistant-intent-registry.data.ts. A
    // "not_matched" result (the overwhelming majority of messages, since only
    // 3 of the Registry's 41 intents are wired so far) falls through to the
    // Claude loop exactly as if this step didn't exist — same fail-open
    // discipline as every other Local Decision Layer step in this method.
    const intentResult = await dispatchIntent(this.rieFacade, this.prisma, user, input.message);
    if (intentResult.status === "answered") {
      return { analysis: intentResult.text, advice: null, decision: null, blocks: [] };
    }
    if (intentResult.status === "needs_time_context") {
      return { analysis: intentResult.clarificationMessage, advice: null, decision: null, blocks: [] };
    }

    const localeInstruction = input.locale === "en" ? "\n\nRespond in English. Keep customer, product, company, and person names exactly as provided." : "";
    const systemPrompt = `${CORE_DNA_SYSTEM_PROMPT}\n\nتاريخ اليوم: ${today}.${scenarioBlock}${mentionedCustomerLine}${localeInstruction}`;

    const messages: ClaudeMessage[] = [
      ...input.history.slice(-ASSISTANT_LIMITS.maxHistoryMessages).map((m): ClaudeMessage => ({ role: m.role, content: m.content })),
      { role: "user", content: input.message },
    ];

    const blocks: AnalysisBlock[] = [];
    // Structured Response Contract — the ONLY source of the returned
    // analysis/advice/decision is a validated submit_structured_reply tool
    // call, never raw prose. finalText is kept only as material for the
    // fallback path (model never called the tool at all, e.g. it errored
    // out or the loop was exhausted without one) — it is never returned to
    // the client as-is.
    let finalText = "";
    let structuredReply: { analysis: string; advice: string | null; decision: string | null } | null = null;

    // Phase 1 — tool gathering. Unforced: the model is free to call any
    // data tool (or submit_structured_reply directly if it already has
    // enough to answer) on every iteration, including the last one. Forcing
    // the structured-reply tool DURING this phase would risk cutting the
    // model off mid data-gathering on its final allowed turn — kept as a
    // fully separate phase 2 below instead, per explicit correction.
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.callClaude(apiKey, systemPrompt, messages);
      const toolUseBlocks = response.content.filter((b): b is Extract<ClaudeContentBlock, { type: "tool_use" }> => b.type === "tool_use");
      const textBlocks = response.content.filter((b): b is Extract<ClaudeContentBlock, { type: "text" }> => b.type === "text");
      const text = textBlocks
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) finalText = text;

      const structuredCall = toolUseBlocks.find((b) => b.name === STRUCTURED_REPLY_TOOL_NAME);
      if (structuredCall) {
        const parsed = this.parseStructuredReply(structuredCall.input);
        if (parsed) structuredReply = parsed;
        // Turn is over regardless of whether parsing succeeded — the model
        // considers itself done once it calls this tool. A parse failure
        // (malformed input) falls through to the fallback below, exactly
        // like the tool never being called at all.
        break;
      }

      if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") break;

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
      for (const toolUse of toolUseBlocks) {
        const result = await this.executeTool(user, toolUse.name, toolUse.input, blocks);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
      }
      messages.push({ role: "user", content: toolResults });
      // Shrink everything except this just-pushed pair before it gets
      // resent on the next iteration — see MAX_TOOL_RESULT_CHARS comment.
      this.compactStaleToolResults(messages);
    }

    // Phase 2 — forced structured reply. Only reached if phase 1 ended
    // (tool iterations exhausted, or the model stopped without ever
    // calling submit_structured_reply) without a valid structured result.
    // This is a genuinely separate, independent call — not a flag checked
    // inside the gathering loop — specifically so it never competes with
    // or cuts off a data tool call on the gathering loop's own last turn.
    if (!structuredReply) {
      const finalResponse = await this.callClaude(apiKey, systemPrompt, messages, true);
      const finalToolUse = finalResponse.content.find((b): b is Extract<ClaudeContentBlock, { type: "tool_use" }> => b.type === "tool_use" && b.name === STRUCTURED_REPLY_TOOL_NAME);
      const finalTextBlocks = finalResponse.content.filter((b): b is Extract<ClaudeContentBlock, { type: "text" }> => b.type === "text");
      const finalTextJoined = finalTextBlocks
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (finalTextJoined) finalText = finalTextJoined;
      if (finalToolUse) {
        const parsed = this.parseStructuredReply(finalToolUse.input);
        if (parsed) structuredReply = parsed;
      }
    }

    if (structuredReply) {
      return { ...structuredReply, blocks };
    }
    // Fallback: the model never produced a valid structured reply even
    // when forced (parse failure, or — tool_choice permitting — it still
    // didn't call the tool). Per the contract, a failure here surfaces only
    // through `analysis` — advice/decision stay null, never guessed.
    return {
      analysis: finalText || "معرفتش أوصل لإجابة واضحة، جرب تصيغ سؤالك بشكل مختلف.",
      advice: null,
      decision: null,
      blocks,
    };
  }

  // FDA Local Decision Layer — Entity Resolution trigger + dispatch.
  // Exact-keyword gate only (no intent classifier): if the message doesn't
  // contain one of these literal terms for a given entity type, that
  // type's resolver never runs and this returns null immediately — the
  // normal Claude loop proceeds untouched, same as if this method didn't
  // exist. Only Employee/Salesperson, Branch, and Region are wired here —
  // Customer is handled separately by the Dictionary Engine block above
  // (it has no self-context concept, so it doesn't need this 4-step flow
  // in the same way, and was already working before this feature).
  //
  // Keyword lists are drawn directly from the client's own business-
  // question catalogue (2026-07-26) — not invented. Kept intentionally
  // narrow: better to miss a trigger (falls through to the normal AI loop,
  // no regression) than to over-trigger and block a question that didn't
  // actually need an entity.
  private readonly employeeTriggerTerms = ["المندوب", "مندوب", "الموظف", "موظف", "المشرف", "مشرف"];
  private readonly branchTriggerTerms = ["الفرع", "فرع"];
  private readonly regionTriggerTerms = ["المنطقة", "منطقة"];

  private async tryResolveNeededEntity(user: AuthenticatedUser, input: AssistantChatRequest): Promise<string | null> {
    const messageLower = input.message.toLowerCase();
    const history: ChatTurn[] = input.history.map((m) => ({ role: m.role, content: m.content }));

    const needsEmployee = this.employeeTriggerTerms.some((t) => messageLower.includes(t));
    const needsBranch = this.branchTriggerTerms.some((t) => messageLower.includes(t));
    const needsRegion = this.regionTriggerTerms.some((t) => messageLower.includes(t));

    if (!needsEmployee && !needsBranch && !needsRegion) return null;

    try {
      if (needsEmployee) {
        const result = await this.rieFacade.getEntityRecords("Employees", this.rieContext(user));
        if (result.available) {
          const resolver = buildEmployeeResolver(result.records);
          const auth: EmployeeResolverAuth = { email: user.email };
          const outcome = await resolveEntity(resolver, input.message, history, auth);
          if (outcome.status === "ambiguous") return outcome.clarificationMessage;
        }
      }

      if (needsBranch) {
        const units = await this.orgUnitsService.list(user.companyId!, { type: "BRANCH" });
        const resolver = buildBranchResolver(units as unknown as OrgUnitLike[]);
        const auth: OrgUnitResolverAuth = { orgUnitId: user.orgUnitId ?? null };
        const outcome = await resolveEntity(resolver, input.message, history, auth);
        if (outcome.status === "ambiguous") return outcome.clarificationMessage;
      }

      if (needsRegion) {
        const units = await this.orgUnitsService.list(user.companyId!, { type: "REGION" });
        const resolver = buildRegionResolver(units as unknown as OrgUnitLike[]);
        const auth: OrgUnitResolverAuth = { orgUnitId: user.orgUnitId ?? null };
        const outcome = await resolveEntity(resolver, input.message, history, auth);
        if (outcome.status === "ambiguous") return outcome.clarificationMessage;
      }
    } catch {
      // Best-effort only, same as the Dictionary Engine block above — a
      // failed lookup (RIE unavailable, DB error) must never block the
      // chat; falls through to the normal AI loop instead of refusing.
      return null;
    }

    // Resolved (or not applicable) for every triggered entity type — no
    // system-prompt injection is added here. Unlike the Customer block,
    // there is no established "mentioned entity" hint format for
    // Employee/Branch/Region yet, and inventing one wasn't part of this
    // pass's scope; the resolved entity's own name/code is already present
    // in the user's message text for the model to read directly. The value
    // delivered by this step is entirely the ambiguous-case refusal above.
    return null;
  }

  // Validates a submit_structured_reply tool call's raw input against the
  // contract shape. Returns null (never throws) on anything malformed so
  // the caller can fall back to the analysis-only path unconditionally.
  private parseStructuredReply(input: unknown): { analysis: string; advice: string | null; decision: string | null } | null {
    if (typeof input !== "object" || input === null) return null;
    const obj = input as Record<string, unknown>;
    if (typeof obj.analysis !== "string" || obj.analysis.trim() === "") return null;
    const advice = typeof obj.advice === "string" && obj.advice.trim() !== "" ? obj.advice : null;
    const decision = typeof obj.decision === "string" && obj.decision.trim() !== "" ? obj.decision : null;
    return { analysis: obj.analysis, advice, decision };
  }

  private async callClaude(apiKey: string, systemPrompt: string, messages: ClaudeMessage[], forceStructuredReply = false): Promise<ClaudeResponse> {
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
          // On the final allowed iteration, force the model to call
          // submit_structured_reply instead of possibly running out of
          // iterations mid tool-use with only prose or nothing at all —
          // this is what makes the structured contract genuinely
          // server-enforced rather than best-effort.
          ...(forceStructuredReply ? { tool_choice: { type: "tool", name: STRUCTURED_REPLY_TOOL_NAME } } : {}),
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

    // 2026-07-26 — a text filter/search that matches zero rows used to come
    // back as a bare empty result, forcing the model to either invent a
    // guess or stop and ask the user (e.g. "جدة" vs "Jeddah" spelled
    // differently in the source data). Surfacing the column's ACTUAL
    // distinct values lets the model retry with the right one itself in the
    // next tool call instead of dead-ending the conversation.
    let noMatchHint: Record<string, string[]> | undefined;
    if (matchingRows.length === 0) {
      const hintColumns = new Set<string>();
      for (const key of ["customerId", "invoiceId", "routeId", "salesRep"] as const) {
        if (input[key]) {
          const column = resolveColumnAlias(headers, key);
          if (column) hintColumns.add(column);
        }
      }
      if (input.filters) {
        for (const key of Object.keys(input.filters)) {
          const column = headers.find((h) => h.toLowerCase() === key.toLowerCase());
          if (column) hintColumns.add(column);
        }
      }
      if (hintColumns.size > 0) {
        noMatchHint = {};
        for (const column of hintColumns) {
          const distinct = [
            ...new Set(
              allRows
                .map((r) => r[column])
                .filter((v) => v !== null && v !== undefined && v !== "")
                .map((v) => String(v)),
            ),
          ].slice(0, 8);
          if (distinct.length > 0) noMatchHint[column] = distinct;
        }
      }
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
          ...(noMatchHint ? { noMatchHint } : {}),
        };
      }

      const result = computeAggregate(input.aggregate.op, matchingRows, column);
      return {
        totalMatchingRows: matchingRows.length,
        aggregate: { op: input.aggregate.op, column: column ?? null, ...result },
        ...(noMatchHint ? { noMatchHint } : {}),
      };
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
    // Safety cap — see MAX_TOOL_RESULT_CHARS comment above. hasMore is
    // computed off the CAPPED length so the model correctly sees there's
    // more data if this page had to be trimmed for size, not just for count.
    const cappedRows = capRowsForModel(rows);

    return {
      totalMatchingRows: matchingRows.length,
      returnedRows: cappedRows.length,
      limit,
      offset,
      hasMore: offset + cappedRows.length < matchingRows.length,
      rows: cappedRows,
      ...(noMatchHint ? { noMatchHint } : {}),
    };
  }

  // Once the model has seen a tool_result (i.e. it's no longer the most
  // recent pair in the array), shrink it before it gets resent again next
  // iteration. Anthropic only requires structural tool_use/tool_result id
  // pairing to stay intact — not the CONTENT — so this is safe: the model
  // already reasoned over the full data in the call where it first arrived.
  private compactStaleToolResults(messages: ClaudeMessage[]): void {
    for (let i = 0; i < messages.length - 2; i++) {
      const message = messages[i];
      if (!message || message.role !== "user" || !Array.isArray(message.content)) continue;
      for (const block of message.content) {
        if ("type" in block && block.type === "tool_result" && "content" in block && block.content.length > STALE_TOOL_RESULT_CHARS) {
          block.content = STALE_TOOL_RESULT_PLACEHOLDER;
        }
      }
    }
  }
}
