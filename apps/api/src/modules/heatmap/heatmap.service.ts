import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  HEATMAP_LIMITS,
  heatmapDecisionResultSchema,
  heatmapInterpretResultSchema,
  type HeatmapDecisionInput,
  type HeatmapDecisionResult,
  type HeatmapInterpretInput,
  type HeatmapInterpretResult,
  type HeatmapQueryResult,
  type HeatmapRieQueryInput,
  type HeatmapScopeField,
  type HeatmapValuesResult,
} from "@field-sales-os/schemas";
import { AppConfigService } from "../../common/config/app-config.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { RieScalableQueryService } from "../rie/scalable-query.service";

// Migration #3 (ADR-001 / RIE Migration Plan, 2026-07-17) — this service no
// longer reads uploaded files or manually-mapped columns. Customers/
// Invoices/Invoice Items/Returns/Collections/Products are all resolved via
// RieFacade against the Canonical Schema. The point-shaping and two-window
// (lostSales/opportunity) algorithms are unchanged in spirit — only how the
// underlying rows get sourced changed (RIE reads + in-memory joins instead
// of arbitrary mapped-column files).

// Same guard as Route Planning — see route-planning.service.ts for the
// real-data rationale (garbage 0,0 rows etc.).
function isSaneCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_CUSTOMERS_PER_REQUEST = 5000;

interface HeatmapCustomerPoint {
  id: string;
  label: string;
  lat: number | null;
  lon: number | null;
}

@Injectable()
export class HeatmapService {
  // A dashboard burst commonly asks for the identical sales aggregate many
  // times at once. Share only the in-flight calculation; completed values
  // are never cached, so each later request still observes current data.
  private readonly salesAggregateInFlight = new Map<string, Promise<Map<string, number>>>();

  constructor(
    private readonly rieFacade: RieFacade,
    private readonly appConfig: AppConfigService,
    private readonly scalableQuery: RieScalableQueryService,
  ) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  private async requireSources(
    context: ReturnType<HeatmapService["rieContext"]>,
    entityNames: readonly string[],
    arabicLabel: string,
  ): Promise<void> {
    if (!(await this.rieFacade.hasCanonicalEntitySources(context, entityNames))) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  // Sales heat maps only need totals per customer. Keep the exact RIE
  // newest-upload-wins semantics in PostgreSQL, then join/filter/aggregate
  // there instead of materializing Invoices and Invoice Items in Node.
  private async aggregateSalesInPostgres(
    user: AuthenticatedUser,
    categoryValue?: string,
    dateFrom?: string,
    dateTo?: string,
    customerCodes?: readonly string[],
  ): Promise<Map<string, number>> {
    const key = JSON.stringify([user.companyId, user.roleCode, user.email.trim().toLowerCase(), categoryValue ?? null, dateFrom ?? null, dateTo ?? null, customerCodes ?? null]);
    const inFlight = this.salesAggregateInFlight.get(key);
    if (inFlight) return inFlight;

    const pending = this.executeSalesAggregateInPostgres(user, categoryValue, dateFrom, dateTo, customerCodes);
    this.salesAggregateInFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.salesAggregateInFlight.get(key) === pending) this.salesAggregateInFlight.delete(key);
    }
  }

  private async executeSalesAggregateInPostgres(
    user: AuthenticatedUser,
    categoryValue?: string,
    dateFrom?: string,
    dateTo?: string,
    customerCodes?: readonly string[],
  ): Promise<Map<string, number>> {
    const fromTime = dateFrom ? Date.parse(dateFrom) : null;
    const toTime = dateTo ? Date.parse(dateTo) : null;
    const ctx = this.rieContext(user);
    await this.requireSources(ctx, categoryValue ? ["Invoices", "Invoice Items", "Products"] : ["Invoices", "Invoice Items"], categoryValue ? "الفواتير وأصنافها والمنتجات" : "الفواتير وأصنافها");
    const totals = await this.scalableQuery.queryHeatmapSales({
      ...ctx,
      mode: "sales",
      categoryValue,
      ...(fromTime !== null && Number.isFinite(fromTime) ? { fromTime } : {}),
      ...(toTime !== null && Number.isFinite(toTime) ? { toTime } : {}),
      customerCodes,
    });
    return new Map(totals.map((row) => [row.customerCode, Number(row.total)]));
  }

  // sales/returns/collection — a per-customer amount total, optionally
  // date- and (for sales) category-filtered. Mechanically identical
  // aggregation across the three metrics; only which Canonical Entity the
  // value comes from differs.
  private async computeAggregateValues(
    user: AuthenticatedUser,
    metric: "sales" | "returns" | "collection",
    categoryValue?: string,
    dateFrom?: string,
    dateTo?: string,
    customerCodes?: readonly string[],
  ): Promise<Map<string, number>> {
    const ctx = this.rieContext(user);
    const fromTime = dateFrom ? Date.parse(dateFrom) : null;
    const toTime = dateTo ? Date.parse(dateTo) : null;
    if (metric === "sales") return this.aggregateSalesInPostgres(user, categoryValue, dateFrom, dateTo, customerCodes);

    const entityName = metric === "collection" ? "Collections" : "Returns";
    await this.requireSources(ctx, [entityName], metric === "collection" ? "التحصيل" : "المرتجعات");
    const totals = await this.scalableQuery.queryHeatmapEntityTotals({
      ...ctx,
      entityName,
      dateField: metric === "collection" ? "CollectionDate" : "ReturnDate",
      amountField: metric === "collection" ? "Amount" : "TotalAmount",
      ...(fromTime !== null && Number.isFinite(fromTime) ? { fromTime } : {}),
      ...(toTime !== null && Number.isFinite(toTime) ? { toTime } : {}),
      customerCodes,
    });
    return new Map(totals.map((row) => [row.customerCode, row.total]));
  }

  private async customerPointsInPostgres(user: AuthenticatedUser, input: HeatmapRieQueryInput): Promise<{ rows: HeatmapCustomerPoint[]; totalRows: number }> {
    const ctx = this.rieContext(user);
    await this.requireSources(ctx, ["Customers"], "العملاء");
    const rows = await this.scalableQuery.queryHeatmapCustomerPoints({
      ...ctx,
      scopeField: input.scopeField,
      scopeValues: input.scopeValues,
      limit: MAX_CUSTOMERS_PER_REQUEST,
    });
    return {
      rows: rows.map(({ id, label, lat, lon }) => ({ id, label, lat, lon })),
      totalRows: rows[0]?.totalRows ?? 0,
    };
  }

  // Lost Sales Map (DNA GVE catalog, Part 20.2): "أين تتركز الفرص الضائعة؟"
  // — customers who used to buy a SKU and stopped. Two fixed date windows
  // the user picks (a "prior" window and a "recent" window) — any SKU a
  // customer bought in the prior window but did NOT buy again in the recent
  // window counts as lost, valued at what it was worth in the prior window.
  private async computeLostSalesValues(user: AuthenticatedUser, input: HeatmapRieQueryInput, customerCodes?: readonly string[]): Promise<Map<string, number>> {
    const { priorDateFrom, priorDateTo, dateFrom, dateTo, categoryValue } = input;
    if (!priorDateFrom || !priorDateTo || !dateFrom || !dateTo) {
      throw new BadRequestException('metric "lostSales" requires priorDateFrom/priorDateTo and dateFrom/dateTo');
    }

    const priorFromTime = Date.parse(priorDateFrom);
    const priorToTime = Date.parse(priorDateTo);
    const recentFromTime = Date.parse(dateFrom);
    const recentToTime = Date.parse(dateTo);
    if ([priorFromTime, priorToTime, recentFromTime, recentToTime].some((t) => Number.isNaN(t))) {
      throw new BadRequestException("priorDateFrom/priorDateTo/dateFrom/dateTo must be valid dates");
    }

    const ctx = this.rieContext(user);
    await this.requireSources(ctx, categoryValue ? ["Invoices", "Invoice Items", "Products"] : ["Invoices", "Invoice Items"], categoryValue ? "الفواتير وأصنافها والمنتجات" : "الفواتير وأصنافها");
    const rows = await this.scalableQuery.queryHeatmapSales({
      ...ctx, mode: "lostSales", categoryValue,
      priorFromTime, priorToTime, fromTime: recentFromTime, toTime: recentToTime, customerCodes,
    });
    return new Map(rows.map((row) => [row.customerCode, row.total]));
  }

  // Territory Opportunity Map (DNA GVE catalog, Part 20.2): "أين تتركز فرص
  // التدخل؟" — broader and shallower than Lost Sales Map on purpose: no SKU
  // dimension, just total spend per customer, prior window vs recent
  // window. Same two-window rows as lostSales, aggregated without the SKU
  // breakdown.
  private async computeOpportunityValues(user: AuthenticatedUser, input: HeatmapRieQueryInput, customerCodes?: readonly string[]): Promise<Map<string, number>> {
    const { priorDateFrom, priorDateTo, dateFrom, dateTo, categoryValue } = input;
    if (!priorDateFrom || !priorDateTo || !dateFrom || !dateTo) {
      throw new BadRequestException('metric "opportunity" requires priorDateFrom/priorDateTo and dateFrom/dateTo');
    }

    const priorFromTime = Date.parse(priorDateFrom);
    const priorToTime = Date.parse(priorDateTo);
    const recentFromTime = Date.parse(dateFrom);
    const recentToTime = Date.parse(dateTo);
    if ([priorFromTime, priorToTime, recentFromTime, recentToTime].some((t) => Number.isNaN(t))) {
      throw new BadRequestException("priorDateFrom/priorDateTo/dateFrom/dateTo must be valid dates");
    }

    const ctx = this.rieContext(user);
    await this.requireSources(ctx, ["Invoices", "Invoice Items"], "الفواتير وأصنافها");
    const rows = await this.scalableQuery.queryHeatmapSales({
      ...ctx, mode: "opportunity", categoryValue,
      priorFromTime, priorToTime, fromTime: recentFromTime, toTime: recentToTime, customerCodes,
    });
    return new Map(rows.map((row) => [row.customerCode, row.total]));
  }

  async query(user: AuthenticatedUser, input: HeatmapRieQueryInput): Promise<HeatmapQueryResult> {
    const cityScope = input.scopeField === "City" && !!input.scopeValues?.length;
    const scoped = !!input.scopeField && !!input.scopeValues?.length;
    const customerResult = await this.customerPointsInPostgres(user, input);
    const customerRows = customerResult.rows;
    if (cityScope && customerResult.totalRows === 0) {
      throw new BadRequestException(`لا توجد بيانات مطابقة لـ City ضمن [${input.scopeValues!.join(", ")}]`);
    }
    if (customerResult.totalRows > MAX_CUSTOMERS_PER_REQUEST) {
      throw new BadRequestException(
        `${customerResult.totalRows} customers match this scope, above the ${MAX_CUSTOMERS_PER_REQUEST}-customer limit for one heat map. Narrow the scope and try again.`,
      );
    }

    const scopedCustomerCodes = scoped ? customerRows.map((row) => row.id) : undefined;

    let valueById: Map<string, number> | null = null;
    if (input.metric === "lostSales") {
      valueById = await this.computeLostSalesValues(user, input, scopedCustomerCodes);
    } else if (input.metric === "opportunity") {
      valueById = await this.computeOpportunityValues(user, input, scopedCustomerCodes);
    } else if (input.metric !== "customerCount") {
      valueById = await this.computeAggregateValues(user, input.metric, input.categoryValue, input.dateFrom, input.dateTo, scopedCustomerCodes);
    }

    const points: HeatmapQueryResult["points"] = [];
    let excludedBadCoordinates = 0;

    for (const row of customerRows) {
      const lat = row.lat;
      const lon = row.lon;
      if (lat === null || lon === null || !isSaneCoordinate(lat, lon)) {
        excludedBadCoordinates++;
        continue;
      }
      const id = row.id;
      const label = row.label;

      let value = 1;
      if (input.metric !== "customerCount") {
        value = valueById ? (valueById.get(id) ?? 0) : 0;
      }
      points.push({ id, label, lat, lon, value });
    }

    return {
      metric: input.metric,
      excludedBadCoordinates,
      totalRows: customerRows.length,
      usedRows: points.length,
      maxValue: points.reduce((m, p) => Math.max(m, p.value), 0),
      totalValue: points.reduce((s, p) => s + p.value, 0),
      points,
    };
  }

  // RIE-backed dedicated dropdown endpoints — same pattern as Migration
  // #2's customer-similarity scope-values/category-values. Route Planning
  // keeps using its own GET /route-planning/distinct-values untouched.
  async scopeValues(user: AuthenticatedUser, scopeField: HeatmapScopeField): Promise<HeatmapValuesResult> {
    const ctx = this.rieContext(user);
    await this.requireSources(ctx, ["Customers"], "العملاء");
    const result = await this.rieFacade.queryCanonicalRecords({
      ...(scopeField === "City" ? { companyId: ctx.companyId } : ctx),
      entityName: "Customers",
      projection: [{ field: scopeField, as: "value" }],
      groupBy: [{ field: scopeField }],
      unboundedFinalResult: true,
    });
    const values = new Set(result.records.map((row) => String(row.value ?? "").trim()).filter(Boolean));
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }

  async categoryValues(user: AuthenticatedUser): Promise<HeatmapValuesResult> {
    const ctx = this.rieContext(user);
    await this.requireSources(ctx, ["Products"], "المنتجات");
    const result = await this.rieFacade.queryCanonicalRecords({
      companyId: ctx.companyId,
      entityName: "Products",
      projection: [{ field: "Category", as: "value" }],
      groupBy: [{ field: "Category" }],
      unboundedFinalResult: true,
    });
    const values = new Set(result.records.map((row) => String(row.value ?? "").trim()).filter(Boolean));
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }

  async interpret(_companyId: string, input: HeatmapInterpretInput): Promise<HeatmapInterpretResult> {
    const apiKey = this.appConfig.values.anthropic.apiKey;
    if (!apiKey) {
      throw new BadRequestException(
        "ميزة الفلترة بالكتابة الحرة تحتاج ANTHROPIC_API_KEY مضبوط على السيرفر. راجع فريقك التقني لضبطه في متغيرات البيئة.",
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const scopeValuesPreview = (input.scopeValues ?? []).slice(0, HEATMAP_LIMITS.maxScopeValuesInPrompt);

    const systemPrompt = [
      "أنت تترجم طلب مستخدم مكتوب بالعربي أو الإنجليزي إلى فلتر JSON صارم لخريطة حرارية لمبيعات/عملاء.",
      `تاريخ اليوم: ${today}.`,
      input.scopeColumn
        ? `عمود النطاق المتاح للفلترة اسمه "${input.scopeColumn}" والقيم الممكنة هي: ${JSON.stringify(scopeValuesPreview)}.`
        : "لا يوجد عمود نطاق متاح حاليًا — لا ترجع scopeValue أبدًا (سيبها null).",
      'أرجع JSON فقط بدون أي نص إضافي وبدون markdown، بالشكل التالي بالظبط (كل المفاتيح لازم تكون موجودة):',
      '{"scopeValue": string|null, "dateFrom": "YYYY-MM-DD"|null, "dateTo": "YYYY-MM-DD"|null, "metric": "sales"|"returns"|"collection"|"customerCount"|null, "understood": boolean, "explanation": string}',
      "لو الطلب مش واضح أو مفيهوش أي فلتر صريح تقدر تستنتجه، رجّع understood:false واشرح ليه في explanation بالعربي بجملة قصيرة.",
      "لو الطلب فيه اسم قيمة نطاق مش موجود بالظبط في القائمة، اختار أقرب تطابق منطقي من القائمة فقط، ولو معرفتش رجّع scopeValue:null واشرح ليه.",
      "متطلب فيه ذكر كلمة زي مبيعات/قيمة/جنيه → metric:\"sales\". متطلب فيه ذكر مرتجعات/مرتجع → metric:\"returns\". متطلب فيه ذكر تحصيل/مديونية/مدفوعات → metric:\"collection\". متطلب فيه ذكر عدد/كثافة/عملاء بس من غير مبيعات → metric:\"customerCount\". لو مفيش ذكر، رجّع metric:null (يفضل زي ما هو).",
    ].join("\n");

    const userMessageParts = [`طلب المستخدم: "${input.prompt}"`];
    if (input.currentScopeValue) userMessageParts.push(`الفلتر الحالي لعمود النطاق: "${input.currentScopeValue}"`);
    if (input.currentDateFrom || input.currentDateTo) {
      userMessageParts.push(`الفترة الحالية: من ${input.currentDateFrom ?? "غير محددة"} إلى ${input.currentDateTo ?? "غير محددة"}`);
    }

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
          max_tokens: 400,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessageParts.join("\n") }],
        }),
      });
    } catch {
      throw new BadRequestException("تعذر الاتصال بخدمة الفهم اللغوي، حاول تاني.");
    }

    if (!response.ok) {
      throw new BadRequestException(`فشل طلب الفهم اللغوي (${response.status}).`);
    }

    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).find((block) => block.type === "text")?.text ?? "";

    let parsed: unknown;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? text);
    } catch {
      throw new BadRequestException("معرفتش أفهم طلبك، جرب تصيغه بشكل مختلف.");
    }

    const result = heatmapInterpretResultSchema.safeParse(parsed);
    if (!result.success) {
      throw new BadRequestException("رد غير متوقع من خدمة الفهم اللغوي، جرب تاني.");
    }
    return result.data;
  }

  // AI Decision Map — see the schema comment. Turns the already-computed
  // top points of whatever's on screen into a short prioritized Arabic
  // action list. Deliberately generation, not analysis: every number in the
  // prompt was already computed deterministically by query() above; Claude
  // only decides what to say about it and in what order.
  async decisionSummary(_companyId: string, input: HeatmapDecisionInput): Promise<HeatmapDecisionResult> {
    const apiKey = this.appConfig.values.anthropic.apiKey;
    if (!apiKey) {
      throw new BadRequestException("ميزة القرارات بالذكاء الاصطناعي تحتاج ANTHROPIC_API_KEY مضبوط على السيرفر.");
    }

    const metricLabelAr: Record<HeatmapDecisionInput["metric"], string> = {
      sales: "المبيعات",
      returns: "المرتجعات",
      collection: "التحصيل",
      lostSales: "الفرص الضائعة",
      opportunity: "فرص التدخل (تراجع عملاء)",
      customerCount: "كثافة العملاء",
    };

    const pointLines = input.topPoints
      .slice(0, HEATMAP_LIMITS.maxTopPointsInDecisionPrompt)
      .map((p, i) => `${i + 1}. ${p.label} — ${p.value.toFixed(0)}`)
      .join("\n");

    const systemPrompt = [
      "أنت مستشار تنفيذي لشركة FMCG بتحلل خريطة حرارية.",
      `المقياس المعروض: ${metricLabelAr[input.metric]}.`,
      input.scopeLabel ? `النطاق: ${input.scopeLabel}.` : "",
      `إجمالي القيمة: ${input.totalValue.toFixed(0)}, عدد النقاط المستخدمة: ${input.usedRows}.`,
      "معاك قائمة أعلى النقاط قيمة على الخريطة (مش كل النقاط، بس الأهم).",
      "المطلوب:",
      "1) ملخص تنفيذي قصير (2-3 جمل بالعربي) عن الصورة العامة.",
      "2) قائمة قرارات عملية مرتبة بالأولوية (3 إلى 6 قرارات) — كل قرار له عنوان قصير وتفصيل جملة أو جملتين، مبني على الأرقام الفعلية اللي معاك مش كلام عام. اربط كل قرار بنقطة أو مجموعة نقاط محددة من القائمة لما يكون منطقي.",
      'أرجع JSON فقط بدون أي نص إضافي وبدون markdown، بالشكل: {"summary": string, "actions": [{"title": string, "detail": string}]}',
    ]
      .filter(Boolean)
      .join("\n");

    const userMessage = `أعلى النقاط:\n${pointLines}`;

    let response: globalThis.Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 800,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });
    } catch {
      throw new BadRequestException("تعذر الاتصال بخدمة الذكاء الاصطناعي، حاول تاني.");
    }

    if (!response.ok) {
      throw new BadRequestException(`فشل طلب توليد القرارات (${response.status}).`);
    }

    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).find((block) => block.type === "text")?.text ?? "";

    let parsed: unknown;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? text);
    } catch {
      throw new BadRequestException("معرفتش أولّد قرارات، جرب تاني.");
    }

    const result = heatmapDecisionResultSchema.safeParse(parsed);
    if (!result.success) {
      throw new BadRequestException("رد غير متوقع من خدمة الذكاء الاصطناعي، جرب تاني.");
    }
    return result.data;
  }
}
