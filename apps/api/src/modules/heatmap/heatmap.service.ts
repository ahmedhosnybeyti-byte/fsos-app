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
import type { EntityQueryResult } from "../rie/entity-provider.interface";

// Migration #3 (ADR-001 / RIE Migration Plan, 2026-07-17) — this service no
// longer reads uploaded files or manually-mapped columns. Customers/
// Invoices/Invoice Items/Returns/Collections/Products are all resolved via
// RieFacade against the Canonical Schema. The point-shaping and two-window
// (lostSales/opportunity) algorithms are unchanged in spirit — only how the
// underlying rows get sourced changed (RIE reads + in-memory joins instead
// of arbitrary mapped-column files).

// Same small helpers as every other map module — duplicated deliberately
// (see customer-similarity.service.ts's comment on why: keeps each
// dashboard feature module self-contained and safe to touch in parallel
// sessions).
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Same guard as Route Planning — see route-planning.service.ts for the
// real-data rationale (garbage 0,0 rows etc.).
function isSaneCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

function toEpochMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_CUSTOMERS_PER_REQUEST = 5000;

interface SalesJoinedRow {
  customerCode: string;
  productCode: string;
  amount: number;
  time: number | null;
}

@Injectable()
export class HeatmapService {
  constructor(
    private readonly rieFacade: RieFacade,
    private readonly appConfig: AppConfigService,
  ) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  private assertAvailable(result: EntityQueryResult, arabicLabel: string): void {
    if (!result.available) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  // Invoice Items joined to Invoices for CustomerCode + InvoiceDate, plus an
  // optional Products join for category filtering — the exact join shape
  // Migration #1 (Customer Comparison) and Migration #2 (Customer
  // Similarity) both use (REL-CU-002/REL-IN-003 in the Relationship
  // Registry). Shared here by the "sales" branch of computeAggregateValues
  // and by computeLostSalesValues/computeOpportunityValues, which both need
  // the same joined rows just aggregated differently.
  private async loadSalesJoinedRows(ctx: ReturnType<HeatmapService["rieContext"]>, categoryValue?: string): Promise<SalesJoinedRow[]> {
    const [invoicesResult, itemsResult, productsResult] = await Promise.all([
      this.rieFacade.getEntityRecords("Invoices", ctx),
      this.rieFacade.getEntityRecords("Invoice Items", ctx),
      categoryValue ? this.rieFacade.getEntityRecords("Products", ctx) : Promise.resolve(null),
    ]);
    this.assertAvailable(invoicesResult, "الفواتير");
    this.assertAvailable(itemsResult, "أصناف الفاتورة");

    const invoiceMeta = new Map<string, { customerCode: string; time: number | null }>();
    for (const inv of invoicesResult.records) {
      const no = String(inv.InvoiceNo ?? "").trim();
      const cust = String(inv.CustomerCode ?? "").trim();
      if (no && cust) invoiceMeta.set(no, { customerCode: cust, time: toEpochMs(inv.InvoiceDate) });
    }

    let productCategory: Map<string, string> | null = null;
    if (categoryValue && productsResult) {
      this.assertAvailable(productsResult, "المنتجات");
      productCategory = new Map();
      for (const p of productsResult.records) {
        const code = String(p.ProductCode ?? "").trim();
        if (code) productCategory.set(code, String(p.Category ?? ""));
      }
    }

    const rows: SalesJoinedRow[] = [];
    for (const item of itemsResult.records) {
      const invoiceNo = String(item.InvoiceNo ?? "").trim();
      const meta = invoiceMeta.get(invoiceNo);
      if (!meta) continue; // item's invoice not found — dropped, same as Migration #1's join
      const productCode = String(item.ProductCode ?? "").trim();
      if (productCategory && productCategory.get(productCode) !== categoryValue) continue;
      rows.push({ customerCode: meta.customerCode, productCode, amount: toFiniteNumber(item.LineTotal) ?? 0, time: meta.time });
    }
    return rows;
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
  ): Promise<Map<string, number>> {
    const ctx = this.rieContext(user);
    const fromTime = dateFrom ? Date.parse(dateFrom) : null;
    const toTime = dateTo ? Date.parse(dateTo) : null;
    const inWindow = (t: number | null) => {
      if (fromTime === null && toTime === null) return true;
      if (t === null) return false;
      if (fromTime !== null && t < fromTime) return false;
      if (toTime !== null && t > toTime) return false;
      return true;
    };

    const valueById = new Map<string, number>();

    if (metric === "collection") {
      const result = await this.rieFacade.getEntityRecords("Collections", ctx);
      this.assertAvailable(result, "التحصيل");
      for (const row of result.records) {
        if (!inWindow(toEpochMs(row.CollectionDate))) continue;
        const id = String(row.CustomerCode ?? "").trim();
        if (!id) continue;
        const amount = toFiniteNumber(row.Amount) ?? 0;
        valueById.set(id, (valueById.get(id) ?? 0) + amount);
      }
      return valueById;
    }

    if (metric === "returns") {
      const result = await this.rieFacade.getEntityRecords("Returns", ctx);
      this.assertAvailable(result, "المرتجعات");
      for (const row of result.records) {
        if (!inWindow(toEpochMs(row.ReturnDate))) continue;
        const id = String(row.CustomerCode ?? "").trim();
        if (!id) continue;
        const amount = toFiniteNumber(row.TotalAmount) ?? 0;
        valueById.set(id, (valueById.get(id) ?? 0) + amount);
      }
      return valueById;
    }

    // sales
    const rows = await this.loadSalesJoinedRows(ctx, categoryValue);
    for (const row of rows) {
      if (!inWindow(row.time)) continue;
      valueById.set(row.customerCode, (valueById.get(row.customerCode) ?? 0) + row.amount);
    }
    return valueById;
  }

  // Lost Sales Map (DNA GVE catalog, Part 20.2): "أين تتركز الفرص الضائعة؟"
  // — customers who used to buy a SKU and stopped. Two fixed date windows
  // the user picks (a "prior" window and a "recent" window) — any SKU a
  // customer bought in the prior window but did NOT buy again in the recent
  // window counts as lost, valued at what it was worth in the prior window.
  private async computeLostSalesValues(user: AuthenticatedUser, input: HeatmapRieQueryInput): Promise<Map<string, number>> {
    const { priorDateFrom, priorDateTo, dateFrom, dateTo, categoryValue } = input;
    if (!priorDateFrom || !priorDateTo || !dateFrom || !dateTo) {
      throw new BadRequestException('metric "lostSales" requires priorDateFrom/priorDateTo and dateFrom/dateTo');
    }

    const rows = await this.loadSalesJoinedRows(this.rieContext(user), categoryValue);

    const priorFromTime = Date.parse(priorDateFrom);
    const priorToTime = Date.parse(priorDateTo);
    const recentFromTime = Date.parse(dateFrom);
    const recentToTime = Date.parse(dateTo);
    if ([priorFromTime, priorToTime, recentFromTime, recentToTime].some((t) => Number.isNaN(t))) {
      throw new BadRequestException("priorDateFrom/priorDateTo/dateFrom/dateTo must be valid dates");
    }

    const priorSkuValueByCustomer = new Map<string, Map<string, number>>();
    const recentSkusByCustomer = new Map<string, Set<string>>();

    for (const row of rows) {
      const t = row.time;
      if (t === null) continue;
      if (!row.customerCode || !row.productCode) continue;

      if (t >= priorFromTime && t <= priorToTime) {
        let bySku = priorSkuValueByCustomer.get(row.customerCode);
        if (!bySku) {
          bySku = new Map();
          priorSkuValueByCustomer.set(row.customerCode, bySku);
        }
        bySku.set(row.productCode, (bySku.get(row.productCode) ?? 0) + row.amount);
      }
      if (t >= recentFromTime && t <= recentToTime) {
        let skus = recentSkusByCustomer.get(row.customerCode);
        if (!skus) {
          skus = new Set();
          recentSkusByCustomer.set(row.customerCode, skus);
        }
        skus.add(row.productCode);
      }
    }

    const lostValueById = new Map<string, number>();
    for (const [id, priorSkus] of priorSkuValueByCustomer) {
      const recentSkus = recentSkusByCustomer.get(id);
      let lost = 0;
      for (const [sku, value] of priorSkus) {
        if (!recentSkus?.has(sku)) lost += value;
      }
      lostValueById.set(id, lost);
    }
    return lostValueById;
  }

  // Territory Opportunity Map (DNA GVE catalog, Part 20.2): "أين تتركز فرص
  // التدخل؟" — broader and shallower than Lost Sales Map on purpose: no SKU
  // dimension, just total spend per customer, prior window vs recent
  // window. Same two-window rows as lostSales, aggregated without the SKU
  // breakdown.
  private async computeOpportunityValues(user: AuthenticatedUser, input: HeatmapRieQueryInput): Promise<Map<string, number>> {
    const { priorDateFrom, priorDateTo, dateFrom, dateTo, categoryValue } = input;
    if (!priorDateFrom || !priorDateTo || !dateFrom || !dateTo) {
      throw new BadRequestException('metric "opportunity" requires priorDateFrom/priorDateTo and dateFrom/dateTo');
    }

    const rows = await this.loadSalesJoinedRows(this.rieContext(user), categoryValue);

    const priorFromTime = Date.parse(priorDateFrom);
    const priorToTime = Date.parse(priorDateTo);
    const recentFromTime = Date.parse(dateFrom);
    const recentToTime = Date.parse(dateTo);
    if ([priorFromTime, priorToTime, recentFromTime, recentToTime].some((t) => Number.isNaN(t))) {
      throw new BadRequestException("priorDateFrom/priorDateTo/dateFrom/dateTo must be valid dates");
    }

    const priorTotalByCustomer = new Map<string, number>();
    const recentTotalByCustomer = new Map<string, number>();

    for (const row of rows) {
      const t = row.time;
      if (t === null || !row.customerCode) continue;
      if (t >= priorFromTime && t <= priorToTime) {
        priorTotalByCustomer.set(row.customerCode, (priorTotalByCustomer.get(row.customerCode) ?? 0) + row.amount);
      }
      if (t >= recentFromTime && t <= recentToTime) {
        recentTotalByCustomer.set(row.customerCode, (recentTotalByCustomer.get(row.customerCode) ?? 0) + row.amount);
      }
    }

    // Opportunity value = how much a customer's spend dropped, floored at 0
    // (a customer who grew isn't a "declining" opportunity here).
    const opportunityById = new Map<string, number>();
    for (const [id, priorTotal] of priorTotalByCustomer) {
      const recentTotal = recentTotalByCustomer.get(id) ?? 0;
      const decline = priorTotal - recentTotal;
      if (decline > 0) opportunityById.set(id, decline);
    }
    return opportunityById;
  }

  async query(user: AuthenticatedUser, input: HeatmapRieQueryInput): Promise<HeatmapQueryResult> {
    const ctx = this.rieContext(user);
    const customersResult = await this.rieFacade.getEntityRecords("Customers", ctx);
    this.assertAvailable(customersResult, "العملاء");

    let customerRecords = customersResult.records;
    if (input.scopeField && input.scopeValues && input.scopeValues.length > 0) {
      const scopeSet = new Set(input.scopeValues);
      customerRecords = customerRecords.filter((row) => scopeSet.has(String(row[input.scopeField!] ?? "")));
      if (customerRecords.length === 0) {
        throw new BadRequestException(`لا توجد بيانات مطابقة لـ ${input.scopeField} ضمن [${input.scopeValues.join(", ")}]`);
      }
    }
    if (customerRecords.length > MAX_CUSTOMERS_PER_REQUEST) {
      throw new BadRequestException(
        `${customerRecords.length} customers match this scope, above the ${MAX_CUSTOMERS_PER_REQUEST}-customer limit for one heat map. Narrow the scope and try again.`,
      );
    }

    let valueById: Map<string, number> | null = null;
    if (input.metric === "lostSales") {
      valueById = await this.computeLostSalesValues(user, input);
    } else if (input.metric === "opportunity") {
      valueById = await this.computeOpportunityValues(user, input);
    } else if (input.metric !== "customerCount") {
      valueById = await this.computeAggregateValues(user, input.metric, input.categoryValue, input.dateFrom, input.dateTo);
    }

    const points: HeatmapQueryResult["points"] = [];
    let excludedBadCoordinates = 0;

    for (const row of customerRecords) {
      const lat = toFiniteNumber(row.Latitude);
      const lon = toFiniteNumber(row.Longitude);
      if (lat === null || lon === null || !isSaneCoordinate(lat, lon)) {
        excludedBadCoordinates++;
        continue;
      }
      const id = String(row.CustomerCode ?? "").trim();
      const label = String(row.CustomerName ?? id);

      let value = 1;
      if (input.metric !== "customerCount") {
        value = valueById ? (valueById.get(id) ?? 0) : 0;
      }
      points.push({ id, label, lat, lon, value });
    }

    return {
      metric: input.metric,
      excludedBadCoordinates,
      totalRows: customerRecords.length,
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
    const customersResult = await this.rieFacade.getEntityRecords("Customers", this.rieContext(user));
    this.assertAvailable(customersResult, "العملاء");
    const values = new Set<string>();
    for (const row of customersResult.records) {
      const v = String(row[scopeField] ?? "").trim();
      if (v) values.add(v);
    }
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }

  async categoryValues(user: AuthenticatedUser): Promise<HeatmapValuesResult> {
    const productsResult = await this.rieFacade.getEntityRecords("Products", this.rieContext(user));
    this.assertAvailable(productsResult, "المنتجات");
    const values = new Set<string>();
    for (const row of productsResult.records) {
      const v = String(row.Category ?? "").trim();
      if (v) values.add(v);
    }
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
