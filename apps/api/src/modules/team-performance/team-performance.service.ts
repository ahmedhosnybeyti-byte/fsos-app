import { Injectable, NotFoundException } from "@nestjs/common";
import {
  type TeamPerformanceCoachInput,
  type TeamPerformanceCoachResult,
  type TeamPerformanceRepRow,
  type TeamPerformanceRieQueryInput,
  type TeamPerformanceResult,
} from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { retrieveScenarios } from "../assistant/data/scenario-retrieval.util";
import { RieFacade } from "../rie/rie-facade.service";
import { PrismaService } from "../../common/prisma";
import type { RieScalableQueryResult } from "../rie/scalable-query.types";

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type Metric = "sales" | "collection" | "returns";
type SmallRow = Record<string, unknown>;
interface RepAccumulator { routeIds: string[]; repName: string; repEmail: string; supervisorEmail: string | null; supervisorName: string | null; sales: number; salesPrior: number; collection: number; collectionPrior: number; returns: number; returnsPrior: number; }

// Migration #7 (ADR-001 / RIE Migration Plan) — RIE-backed, no file/column
// mapping. FilesService and PrismaService are no longer dependencies of
// this service (Employees carries names/emails directly, no platform User
// lookup needed).
//
// Three business decisions were reviewed and explicitly approved by the
// Product Owner before this migration (not a mechanical repeat of Migration
// #6's pattern):
//
// 1. Sales = Invoice Items.LineTotal joined to Invoices (RouteID +
//    InvoiceDate), NOT Invoices.TotalAfterVAT directly — kept identical to
//    Heat Map / Customer Comparison's sales source so this screen's numbers
//    stay consistent with the rest of the platform for the same period.
// 2. Supervisor grouping = Employees.DirectManagerID (the formal reporting
//    line), NOT Routes.SupervisorID — Team Performance represents the
//    official management structure, not the operational route structure.
// 3. Each of sales/collection/returns is independent. A category whose
//    Dataset isn't uploaded at all is omitted (fields stay null on every
//    rep row, categoriesAvailable.<category> is false) instead of being
//    zeroed or blocking the other two categories from rendering.
//
// Rep identity: same two-hop join as Migration #6 (Visit Efficiency) —
// RouteID -> Routes.SalesRepID -> Employees. Sales/Collections/Returns all
// carry RouteID directly (Collections/Returns) or via their parent Invoice
// (Invoice Items), so no Visits entity is involved here. Falls back to the
// bare SalesRepID or RouteID when the employee record can't be resolved —
// rows stay usable rather than being silently dropped, same as every other
// migrated screen.
@Injectable()
export class TeamPerformanceService {
  constructor(private readonly rieFacade: RieFacade, private readonly prisma: PrismaService) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  private numeric(value: unknown) { return toFiniteNumber(value) ?? 0; }

  /**
   * One bounded, grouped PostgreSQL result. Facts are filtered before their
   * route/employee joins; Node only merges one already-aggregated row per
   * rep/category/period. Route IDs are also distinct-aggregated in SQL.
   */
  private perRepMetric(ctx: ReturnType<TeamPerformanceService["rieContext"]>, metric: Metric, from: string, to: string, routeIds?: string[]) {
    const definition = metric === "sales"
      ? { entityName: "Invoice Items", amount: "LineTotal", date: { field: "InvoiceDate", source: "invoice" }, routeSource: "invoice", joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }] }
      : metric === "collection"
        ? { entityName: "Collections", amount: "Amount", date: { field: "CollectionDate" }, routeSource: "base", joins: [] }
        : { entityName: "Returns", amount: "TotalAmount", date: { field: "ReturnDate" }, routeSource: "base", joins: [] };
    const route = { entityName: "Routes", alias: "route", type: "left" as const, on: { left: { field: "RouteID", source: definition.routeSource === "base" ? undefined : definition.routeSource }, rightField: "RouteID" } };
    const rep = { entityName: "Employees", alias: "rep", type: "left" as const, on: { left: { field: "SalesRepID", source: "route" }, rightField: "EmployeeID" } };
    const manager = { entityName: "Employees", alias: "manager", type: "left" as const, on: { left: { field: "DirectManagerID", source: "rep" }, rightField: "EmployeeID" } };
    const routeField = { field: "RouteID", ...(definition.routeSource === "base" ? {} : { source: definition.routeSource }) };
    return this.rieFacade.queryCanonicalRecords({ ...ctx, entityName: definition.entityName, projection: [
      { field: "SalesRepID", source: "route", as: "salesRepId" }, { field: "EmployeeName", source: "rep", as: "repName" }, { field: "Email", source: "rep", as: "repEmail" }, { field: "Email", source: "manager", as: "supervisorEmail" }, { field: "EmployeeName", source: "manager", as: "supervisorName" },
    ], groupBy: [{ field: "SalesRepID", source: "route" }, { field: "EmployeeName", source: "rep" }, { field: "Email", source: "rep" }, { field: "Email", source: "manager" }, { field: "EmployeeName", source: "manager" }], joins: [...definition.joins, route, rep, manager], hierarchyRoute: routeField, scope: { date: { ...definition.date, from, to }, ...(routeIds?.length ? { route: { values: routeIds, source: definition.routeSource === "base" ? undefined : definition.routeSource } } : {}) }, aggregates: [{ op: "arrayAggDistinct", field: "RouteID", source: definition.routeSource === "base" ? undefined : definition.routeSource, as: "routeIds" }, { op: "sum", field: definition.amount, as: "value" }], pagination: { limit: 5000 } });
  }

  async query(user: AuthenticatedUser, input: TeamPerformanceRieQueryInput): Promise<TeamPerformanceResult> {
    const ctx = this.rieContext(user);
    const hasPrior = !!(input.priorDateFrom && input.priorDateTo);
    const [versions, salesCurrent, collectionCurrent, returnsCurrent, salesPrior, collectionPrior, returnsPrior, salesSummary, targetsResult] = await Promise.all([
      this.prisma.rieDatasetVersion.findMany({ where: { companyId: ctx.companyId, entityName: { in: ["Routes", "Invoices", "Invoice Items", "Collections", "Returns"] }, isActive: true }, select: { entityName: true } }),
      this.perRepMetric(ctx, "sales", input.dateFrom, input.dateTo, input.routeIds), this.perRepMetric(ctx, "collection", input.dateFrom, input.dateTo, input.routeIds), this.perRepMetric(ctx, "returns", input.dateFrom, input.dateTo, input.routeIds),
      hasPrior ? this.perRepMetric(ctx, "sales", input.priorDateFrom!, input.priorDateTo!, input.routeIds) : Promise.resolve(null), hasPrior ? this.perRepMetric(ctx, "collection", input.priorDateFrom!, input.priorDateTo!, input.routeIds) : Promise.resolve(null), hasPrior ? this.perRepMetric(ctx, "returns", input.priorDateFrom!, input.priorDateTo!, input.routeIds) : Promise.resolve(null),
      this.rieFacade.queryCanonicalRecords({ ...ctx, entityName: "Invoice Items", projection: [], joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }], hierarchyRoute: { field: "RouteID", source: "invoice" }, scope: { date: { field: "InvoiceDate", source: "invoice", from: input.dateFrom, to: input.dateTo }, ...(input.routeIds?.length ? { route: { values: input.routeIds, source: "invoice" } } : {}) }, aggregates: [{ op: "countDistinct", field: "CustomerCode", source: "invoice", as: "customers" }, { op: "countDistinct", field: "InvoiceNo", as: "invoices" }, { op: "countDistinct", field: "ProductCode", as: "skus" }], pagination: { limit: 1 } }),
      this.rieFacade.queryCanonicalRecords({ ...ctx, entityName: "Targets", projection: [], scope: { ...(input.routeIds?.length ? { route: { values: input.routeIds } } : {}), fields: [{ field: "Year", values: [String(new Date(input.dateFrom).getUTCFullYear())] }, { field: "Month", values: [String(new Date(input.dateFrom).getUTCMonth() + 1)] }] }, aggregates: [{ op: "sum", field: "SalesTarget", as: "SalesTarget" }, { op: "sum", field: "CollectionTarget", as: "CollectionTarget" }, { op: "sum", field: "ActiveCustomersTarget", as: "ActiveCustomersTarget" }, { op: "sum", field: "SKUDistributionTarget", as: "SKUDistributionTarget" }], pagination: { limit: 1 } }),
    ]);
    const active = new Set(versions.map((version) => version.entityName));
    if (!active.has("Routes")) throw new NotFoundException('بيانات "المسارات" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.');
    const salesAvailable = active.has("Invoices") && active.has("Invoice Items"), collectionAvailable = active.has("Collections"), returnsAvailable = active.has("Returns");
    const acc = new Map<string, RepAccumulator>();
    const merge = (result: RieScalableQueryResult | null, metric: Metric, prior: boolean) => result?.records.forEach((row) => {
      const r = row as SmallRow, routeIds = Array.isArray(r.routeIds) ? r.routeIds.map((routeId) => String(routeId).trim()).filter(Boolean) : [], salesRepId = String(r.salesRepId ?? "").trim(), repEmail = String(r.repEmail ?? "").trim() || salesRepId || routeIds[0];
      if (!routeIds.length || !repEmail) return;
      let entry = acc.get(repEmail); if (!entry) { entry = { routeIds: [], repName: String(r.repName ?? "").trim() || repEmail, repEmail, supervisorEmail: String(r.supervisorEmail ?? "").trim() || null, supervisorName: String(r.supervisorName ?? "").trim() || null, sales: 0, salesPrior: 0, collection: 0, collectionPrior: 0, returns: 0, returnsPrior: 0 }; acc.set(repEmail, entry); }
      for (const routeId of routeIds) if (!entry.routeIds.includes(routeId)) entry.routeIds.push(routeId);
      entry[prior ? `${metric}Prior` as "salesPrior" | "collectionPrior" | "returnsPrior" : metric] += this.numeric(r.value);
    });
    merge(salesCurrent, "sales", false); merge(collectionCurrent, "collection", false); merge(returnsCurrent, "returns", false); merge(salesPrior, "sales", true); merge(collectionPrior, "collection", true); merge(returnsPrior, "returns", true);

    const reps: TeamPerformanceRepRow[] = Array.from(acc.values()).map((r) => ({
      routeIds: Array.from(r.routeIds),
      repEmail: r.repEmail,
      repName: r.repName,
      supervisorEmail: r.supervisorEmail,
      supervisorName: r.supervisorName,
      sales: salesAvailable ? r.sales : null,
      salesPrior: salesAvailable && hasPrior ? r.salesPrior : null,
      collection: collectionAvailable ? r.collection : null,
      collectionPrior: collectionAvailable && hasPrior ? r.collectionPrior : null,
      returns: returnsAvailable ? r.returns : null,
      returnsPrior: returnsAvailable && hasPrior ? r.returnsPrior : null,
    }));
    reps.sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0));

    const sum = (field: "sales" | "collection" | "returns") => reps.some((rep) => rep[field] !== null) ? reps.reduce((total, rep) => total + (rep[field] ?? 0), 0) : null;
    const aggregate = salesSummary.records[0] as SmallRow | undefined;
    const targetAggregate = targetsResult.records[0] as SmallRow | undefined;
    const target = (field: string) => this.numeric(targetAggregate?.[field]);
    const invoices = this.numeric(aggregate?.invoices);
    const summary = { sales: sum("sales"), collections: sum("collection"), productiveCustomers: salesAvailable ? this.numeric(aggregate?.customers) : null, averageInvoice: salesAvailable && invoices ? (sum("sales") ?? 0) / invoices : null, skus: salesAvailable ? this.numeric(aggregate?.skus) : null, returns: sum("returns") };
    const targetDefinitions: Array<{ key: string; label: string; actual: number | null; primary: boolean }> = [
      { key: "SalesTarget", label: "Sales target", actual: summary.sales, primary: true }, { key: "CollectionTarget", label: "Collection target", actual: summary.collections, primary: true },
      { key: "ActiveCustomersTarget", label: "Productive customers target", actual: summary.productiveCustomers, primary: false }, { key: "SKUDistributionTarget", label: "SKU distribution target", actual: summary.skus, primary: false },
    ];
    const targets = targetDefinitions.map(({ key, label, actual, primary }) => { const value = target(key); return { key, label, target: value, actual, progressPct: value > 0 && actual !== null ? (actual / value) * 100 : null, primary }; }).filter((item) => item.target > 0);

    return {
      reps,
      scopedToOwnTeam: user.roleCode === "SUPERVISOR",
      categoriesAvailable: { sales: salesAvailable, collection: collectionAvailable, returns: returnsAvailable },
      summary,
      targets,
    };
  }

  // Rule-based guidance — no LLM call. Unchanged by Migration #7.
  coach(input: TeamPerformanceCoachInput): TeamPerformanceCoachResult {
    const returnRate = input.sales > 0 ? input.returns / input.sales : 0;
    const collectionRate = input.sales > 0 ? input.collection / input.sales : 0;
    const salesTrendPct = input.salesPrior !== null && input.salesPrior > 0 ? (input.sales - input.salesPrior) / input.salesPrior : null;

    let category: "sales_declining" | "returns_high" | "collection_low" | "sales_growing" | "steady" = "steady";
    if (salesTrendPct !== null && salesTrendPct < -0.1) category = "sales_declining";
    else if (returnRate > 0.15) category = "returns_high";
    else if (collectionRate < 0.7 && input.sales > 0) category = "collection_low";
    else if (salesTrendPct !== null && salesTrendPct > 0.1) category = "sales_growing";

    const fallback: Record<typeof category, { note: string; tone: TeamPerformanceCoachResult["tone"]; query: string }> = {
      sales_declining: {
        note: `مبيعات ${input.repName} تراجعت عن الفترة اللي فاتت — كلّمه يعرف السبب قبل ما يتكرر الشهر الجاي.`,
        tone: "attention",
        query: "مبيعات تراجع انخفاض متابعة زيارة",
      },
      returns_high: {
        note: `مرتجعات ${input.repName} أعلى من المعتاد — جرب تسأله ليه قبل ما تتكرر.`,
        tone: "attention",
        query: "مرتجعات مشكلة تكرار جودة",
      },
      collection_low: {
        note: `نسبة تحصيل ${input.repName} منخفضة نسبة للمبيعات — يستاهل متابعة على العملاء المتأخرين.`,
        tone: "attention",
        query: "تحصيل متأخر متابعة عميل مديونية",
      },
      sales_growing: {
        note: `${input.repName} في نمو واضح عن الفترة اللي فاتت — ثبّت نفس الزيارات والنمط.`,
        tone: "positive",
        query: "أداء ممتاز نمو نجاح",
      },
      steady: {
        note: `أداء ${input.repName} مستقر ضمن المعتاد.`,
        tone: "neutral",
        query: "أداء مستقر معتاد",
      },
    };

    const chosen = fallback[category];
    const matches = retrieveScenarios(chosen.query, 1);
    if (matches.length > 0) {
      const scenario = matches[0]!;
      return { note: `${chosen.note} (${scenario.readyPhrase})`, tone: chosen.tone };
    }
    return { note: chosen.note, tone: chosen.tone };
  }
}
