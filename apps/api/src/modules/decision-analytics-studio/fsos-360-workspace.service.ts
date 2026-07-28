import { BadRequestException, Injectable } from "@nestjs/common";
import type { Fsos360Availability, Fsos360FilterOptionsQuery, Fsos360Kpi, Fsos360Query } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { assignmentMatchesAt, Fsos360ContextService, type Fsos360ResolvedContext } from "./fsos-360-context.service";

interface SalesRow { invoiceNo: string; customerCode: string; productCode: string; routeId: string; time: number | null; amount: number }
interface OperationRow { customerCode: string; routeId: string; time: number | null; amount: number }
interface Window { from: number; to: number }
type VisualizationRequest = NonNullable<Fsos360Query["visualization"]>;
type VisualizationAvailability = "available" | "unavailable" | "not-applicable";

const MAX_CATEGORY_ITEMS = 40;
const MAX_TREEMAP_ITEMS = 20;
const MAX_GEO_POINTS = 750;

function numberOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function timeOf(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function availability(available: boolean, reason = "missing-dataset"): { availability: Fsos360Availability; reason: string | null } {
  return available ? { availability: "available", reason: null } : { availability: "unavailable", reason };
}

function change(current: number | null, previous: number | null) {
  if (current === null || previous === null) return { changeValue: null, changePercentage: null, direction: "not-comparable" as const };
  const changeValue = current - previous;
  return {
    changeValue,
    changePercentage: previous === 0 ? null : (changeValue / Math.abs(previous)) * 100,
    direction: changeValue > 0 ? "up" as const : changeValue < 0 ? "down" as const : "flat" as const,
  };
}

function metric(id: Fsos360Kpi["id"], currentValue: number | null, previousValue: number | null, available: Fsos360Availability, reason: string | null, polarity: Fsos360Kpi["polarity"], meaningCode?: string): Fsos360Kpi {
  const delta = change(currentValue, previousValue);
  return {
    id,
    currentValue,
    previousValue,
    ...delta,
    polarity,
    businessMeaning: meaningCode && available === "available" ? { code: meaningCode, params: { direction: delta.direction, changePercentage: delta.changePercentage ?? "" } } : null,
    availability: available,
    reason,
  };
}

@Injectable()
export class Fsos360WorkspaceService {
  constructor(private readonly contextService: Fsos360ContextService) {}

  async query(user: AuthenticatedUser, input: Fsos360Query) {
    const context = await this.contextService.resolve(user, input.filters, input.analysisFocus);
    const windows = { current: this.window(input.currentPeriod), comparison: this.window(input.comparisonPeriod) };
    const salesRows = this.salesRows(context);
    const analysisAvailability = this.analysisAvailability(context, windows, salesRows);
    const currentRows = analysisAvailability.availability === "available" ? salesRows.filter((row) => this.inWindow(row.time, windows.current) && this.matches(row, context)) : [];
    const previousRows = analysisAvailability.availability === "available" ? salesRows.filter((row) => this.inWindow(row.time, windows.comparison) && this.matches(row, context)) : [];
    const kpis = this.kpis(context, currentRows, previousRows, windows, analysisAvailability);
    const target = this.target(context, currentRows, input.currentPeriod);
    const timeline = this.timeline(currentRows, previousRows, input.currentPeriod, input.comparisonPeriod);
    const visualization = this.visualization(context, currentRows, previousRows, windows, input.visualization, analysisAvailability);
    const salesRepHistory = context.capabilities.routeAssignments!;

    return {
      analysisContext: { currentPeriod: input.currentPeriod, comparisonPeriod: input.comparisonPeriod, entityMode: context.activeAnalysisLevel },
      resolvedFilters: context.filters,
      removedSelections: context.removedSelections,
      activeAnalysisLevel: context.activeAnalysisLevel,
      smallFilterOptions: context.smallFilterOptions,
      smartSlicerCapabilities: {
        customer: { availability: context.datasets.Customers.available ? "available" : "unavailable", reason: context.datasets.Customers.available ? null : "customers-dataset-unavailable", total: context.customers.size },
        product: { availability: context.datasets.Products.available ? "available" : "unavailable", reason: context.datasets.Products.available ? null : "products-dataset-unavailable", total: context.products.size },
        brand: { availability: context.datasets.Products.available ? "available" : "unavailable", reason: context.datasets.Products.available ? null : "products-dataset-unavailable", total: new Set(Array.from(context.products.values(), (p) => p.brand).filter(Boolean)).size },
        category: { availability: context.datasets.Products.available ? "available" : "unavailable", reason: context.datasets.Products.available ? null : "products-dataset-unavailable", total: new Set(Array.from(context.products.values(), (p) => p.category).filter(Boolean)).size },
        salesRep: { availability: salesRepHistory.availability, reason: salesRepHistory.reason, total: new Set(context.routeAssignments.filter((a) => a.role === "SalesRep" && a.startAt !== null).map((a) => a.employeeId)).size },
      },
      executiveInsight: this.executiveInsight(kpis, analysisAvailability),
      kpis,
      performanceComparison: kpis,
      timeline,
      target,
      visualization,
      opportunities: { availability: "unavailable", reason: "pending-business-approval", items: [] },
      recommendations: { availability: "unavailable", reason: "pending-business-approval", items: [] },
      capabilities: {
        ...context.capabilities,
        datasets: Object.fromEntries(Object.entries(context.datasets).map(([name, result]) => [name, availability(result.available)])),
        analysis: analysisAvailability,
        sgi: { availability: "unavailable", reason: "sgi-filter-scope-not-supported" },
        lostSales: { availability: "pending-business-approval", reason: "lost-sales-aggregation-and-deduplication-unapproved" },
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async filterOptions(user: AuthenticatedUser, input: Fsos360FilterOptionsQuery) {
    const context = await this.contextService.resolve(user, input.context.filters, input.context.analysisFocus);
    const needle = input.query.trim().toLocaleLowerCase();
    const salesRepUnavailable = input.field === "sales-rep" && !context.capabilities.routeAssignments!.available;
    let all: { value: string; label: string; meta?: Record<string, string> }[] = [];
    if (!salesRepUnavailable && input.field === "customer") {
      all = Array.from(context.customers.values())
        .filter((customer) => this.customerMatches(customer.code, context))
        .map((customer) => ({ value: customer.code, label: customer.name, meta: { city: customer.city, routeId: customer.routeId } }));
    } else if (!salesRepUnavailable && input.field === "product") {
      all = Array.from(context.products.values()).map((product) => ({ value: product.code, label: product.name, meta: { brand: product.brand, category: product.category } }));
    } else if (!salesRepUnavailable && input.field === "brand") {
      all = Array.from(new Set(Array.from(context.products.values(), (product) => product.brand).filter(Boolean))).map((value) => ({ value, label: value }));
    } else if (!salesRepUnavailable && input.field === "category") {
      all = Array.from(new Set(Array.from(context.products.values(), (product) => product.category).filter(Boolean))).map((value) => ({ value, label: value }));
    } else if (!salesRepUnavailable) {
      all = Array.from(new Set(context.routeAssignments
        .filter((assignment) => assignment.role === "SalesRep" && assignment.startAt !== null)
        .map((assignment) => assignment.employeeId)))
        .map((employeeId) => ({ value: employeeId, label: context.employees.get(employeeId)?.name ?? employeeId }));
    }
    const unique = new Map<string, (typeof all)[number]>();
    for (const option of all) if (!unique.has(option.value)) unique.set(option.value, option);
    const filtered = Array.from(unique.values())
      .filter((option) => !needle || `${option.value} ${option.label} ${Object.values(option.meta ?? {}).join(" ")}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => a.label.localeCompare(b.label));
    const start = (input.page - 1) * input.pageSize;
    return {
      field: input.field,
      resolvedFilters: context.filters,
      removedSelections: context.removedSelections,
      availability: salesRepUnavailable ? "unavailable" : "available",
      reason: salesRepUnavailable ? "route-assignment-history-unavailable" : null,
      options: filtered.slice(start, start + input.pageSize),
      page: input.page,
      pageSize: input.pageSize,
      total: filtered.length,
      hasMore: start + input.pageSize < filtered.length,
    };
  }

  async capabilities(user: AuthenticatedUser) {
    const context = await this.contextService.resolve(user, {}, undefined);
    return {
      ...context.capabilities,
      smartSlicers: {
        customer: { available: context.datasets.Customers.available, reason: context.datasets.Customers.available ? null : "customers-dataset-unavailable" },
        product: { available: context.datasets.Products.available, reason: context.datasets.Products.available ? null : "products-dataset-unavailable" },
        salesRep: { available: context.capabilities.routeAssignments!.available, reason: context.capabilities.routeAssignments!.reason },
      },
      target: { availability: context.datasets.Targets.available ? "partial" : "unavailable", reason: context.datasets.Targets.available ? "route-month-target-source" : "targets-dataset-unavailable" },
      lostSales: { availability: "pending-business-approval", reason: "lost-sales-aggregation-and-deduplication-unapproved" },
      sgi: { availability: "unavailable", reason: "sgi-filter-scope-not-supported" },
    };
  }

  private analysisAvailability(context: Fsos360ResolvedContext, windows: { current: Window; comparison: Window }, salesRows: SalesRow[]) {
    if (context.activeAnalysisLevel === "mixed") return { availability: "unavailable" as const, reason: "ambiguous-analysis-focus" };
    if (context.activeAnalysisLevel === "manager" || context.activeAnalysisLevel === "supervisor") return { availability: "unavailable" as const, reason: "manager-supervisor-role-ambiguous" };
    const needsSalesRepHistory = context.activeAnalysisLevel === "sales-rep" || Boolean(context.filters.salesRepIds?.length);
    if (!needsSalesRepHistory) return { availability: "available" as const, reason: null };
    if (!context.capabilities.routeAssignments!.available) return { availability: "unavailable" as const, reason: "route-assignment-history-unavailable" };
    const operationRows = [
      ...salesRows,
      ...this.operationRows(context, "Collections", "CollectionDate", "Amount"),
      ...this.operationRows(context, "Returns", "ReturnDate", "TotalAmount"),
      ...this.operationRows(context, "Visits", "VisitDate", "0"),
    ];
    const relevant = operationRows.filter((row) => (this.inWindow(row.time, windows.current) || this.inWindow(row.time, windows.comparison)) && this.baseMatches(row, context));
    const repIds: Set<string> | null = null;
    for (const operation of relevant) {
      if (operation.time === null || !operation.routeId || !context.routeAssignments.some((assignment) => assignmentMatchesAt(assignment, operation.routeId, operation.time!, repIds))) {
        return { availability: "unavailable" as const, reason: "route-assignment-history-unavailable" };
      }
    }
    return { availability: "available" as const, reason: null };
  }

  private window(period: { from: string; to: string }): Window {
    const from = Date.parse(period.from);
    const to = Date.parse(period.to);
    if (Number.isNaN(from) || Number.isNaN(to) || from > to) throw new BadRequestException("Periods must contain valid ascending dates");
    return { from, to };
  }

  private inWindow(value: number | null, window: Window): boolean {
    return value !== null && value >= window.from && value <= window.to;
  }

  private salesRows(context: Fsos360ResolvedContext): SalesRow[] {
    const invoices = context.datasets.Invoices;
    const items = context.datasets["Invoice Items"];
    if (!invoices.available || !items.available) return [];
    const invoicesByNo = new Map<string, { customerCode: string; routeId: string; time: number | null }>();
    for (const invoice of invoices.records) {
      const invoiceNo = String(invoice.InvoiceNo ?? "").trim();
      if (invoiceNo) invoicesByNo.set(invoiceNo, { customerCode: String(invoice.CustomerCode ?? "").trim(), routeId: String(invoice.RouteID ?? "").trim(), time: timeOf(invoice.InvoiceDate) });
    }
    const rows: SalesRow[] = [];
    for (const item of items.records) {
      const invoiceNo = String(item.InvoiceNo ?? "").trim();
      const invoice = invoicesByNo.get(invoiceNo);
      if (invoice) rows.push({ invoiceNo, customerCode: invoice.customerCode, productCode: String(item.ProductCode ?? "").trim(), routeId: invoice.routeId, time: invoice.time, amount: numberOf(item.LineTotal) ?? 0 });
    }
    return rows;
  }

  private operationRows(context: Fsos360ResolvedContext, dataset: "Collections" | "Returns" | "Visits", dateField: string, amountField: string): OperationRow[] {
    if (!context.datasets[dataset].available) return [];
    return context.datasets[dataset].records.map((row) => ({
      customerCode: String(row.CustomerCode ?? "").trim(),
      routeId: String(row.RouteID ?? "").trim(),
      time: timeOf(row[dateField]),
      amount: amountField === "0" ? 0 : numberOf(row[amountField]) ?? 0,
    }));
  }

  private historicalSalesRepMatches(routeId: string, time: number | null, context: Fsos360ResolvedContext): boolean {
    const selected = context.filters.salesRepIds?.length ? new Set(context.filters.salesRepIds) : null;
    if (!selected && context.activeAnalysisLevel !== "sales-rep") return true;
    return time !== null && context.routeAssignments.some((assignment) => assignmentMatchesAt(assignment, routeId, time, selected));
  }

  private baseMatches(row: OperationRow, context: Fsos360ResolvedContext): boolean {
    const filters = context.filters;
    const customer = context.customers.get(row.customerCode);
    const includes = (values: string[] | undefined, value: string) => !values?.length || values.includes(value);
    if (!customer) return false;
    return includes(filters.cityValues, customer.city)
      && includes(filters.branchIds, customer.branchId)
      && includes(filters.routeIds, row.routeId || customer.routeId)
      && includes(filters.customerCodes, customer.code);
  }

  private matches(row: SalesRow, context: Fsos360ResolvedContext): boolean {
    if (!this.baseMatches(row, context) || !this.historicalSalesRepMatches(row.routeId, row.time, context)) return false;
    const filters = context.filters;
    const product = context.products.get(row.productCode);
    const includes = (values: string[] | undefined, value: string) => !values?.length || values.includes(value);
    if (!product) return !filters.brandValues?.length && !filters.categoryValues?.length && !filters.productCodes?.length;
    return includes(filters.brandValues, product.brand) && includes(filters.categoryValues, product.category) && includes(filters.productCodes, product.code);
  }

  private operationMatches(row: OperationRow, context: Fsos360ResolvedContext): boolean {
    return this.baseMatches(row, context) && this.historicalSalesRepMatches(row.routeId, row.time, context);
  }

  private customerMatches(code: string, context: Fsos360ResolvedContext): boolean {
    const customer = context.customers.get(code);
    if (!customer) return false;
    const filters = context.filters;
    const includes = (values: string[] | undefined, value: string) => !values?.length || values.includes(value);
    return includes(filters.cityValues, customer.city)
      && includes(filters.branchIds, customer.branchId)
      && includes(filters.routeIds, customer.routeId)
      && includes(filters.customerCodes, customer.code);
  }

  private kpis(context: Fsos360ResolvedContext, currentRows: SalesRow[], previousRows: SalesRow[], windows: { current: Window; comparison: Window }, analysis: { availability: Fsos360Availability; reason: string | null }): Fsos360Kpi[] {
    const invoicesAvailable = context.datasets.Invoices.available && context.datasets["Invoice Items"].available;
    const sales = (rows: SalesRow[]) => rows.reduce((sum, row) => sum + row.amount, 0);
    const currentSales = invoicesAvailable && analysis.availability === "available" ? sales(currentRows) : null;
    const previousSales = invoicesAvailable && analysis.availability === "available" ? sales(previousRows) : null;
    const currentOrders = invoicesAvailable && analysis.availability === "available" ? new Set(currentRows.map((row) => row.invoiceNo)).size : null;
    const previousOrders = invoicesAvailable && analysis.availability === "available" ? new Set(previousRows.map((row) => row.invoiceNo)).size : null;
    const productFiltered = Boolean(context.filters.productCodes?.length || context.filters.brandValues?.length || context.filters.categoryValues?.length);
    const total = (dataset: "Collections" | "Returns", dateField: string, amountField: string, window: Window) => {
      if (!context.datasets[dataset].available || productFiltered || analysis.availability !== "available") return null;
      return this.operationRows(context, dataset, dateField, amountField)
        .filter((row) => this.inWindow(row.time, window) && this.operationMatches(row, context))
        .reduce((sum, row) => sum + row.amount, 0);
    };
    const collectionCurrent = total("Collections", "CollectionDate", "Amount", windows.current);
    const collectionPrevious = total("Collections", "CollectionDate", "Amount", windows.comparison);
    const returnsCurrent = total("Returns", "ReturnDate", "TotalAmount", windows.current);
    const returnsPrevious = total("Returns", "ReturnDate", "TotalAmount", windows.comparison);
    const visitMetric = (window: Window) => {
      if (!context.datasets.Visits.available || productFiltered || analysis.availability !== "available") return null;
      let totalVisits = 0;
      let productiveVisits = 0;
      const visited = new Set<string>();
      for (const visit of context.datasets.Visits.records) {
        const row: OperationRow = { customerCode: String(visit.CustomerCode ?? "").trim(), routeId: String(visit.RouteID ?? "").trim(), time: timeOf(visit.VisitDate), amount: 0 };
        if (!this.inWindow(row.time, window) || !this.operationMatches(row, context)) continue;
        totalVisits++;
        visited.add(row.customerCode);
        if (String(visit.VisitStatus ?? "").trim() === "Productive") productiveVisits++;
      }
      const inScopeCustomers = Array.from(context.customers.values()).filter((customer) => {
        if (!this.customerMatches(customer.code, context)) return false;
        if (context.activeAnalysisLevel !== "sales-rep" && !context.filters.salesRepIds?.length) return true;
        const selected = context.filters.salesRepIds?.length ? new Set(context.filters.salesRepIds) : null;
        return context.routeAssignments.some((assignment) => assignmentMatchesAt(assignment, customer.routeId, window.from, selected));
      }).length;
      return { coverage: inScopeCustomers ? (visited.size / inScopeCustomers) * 100 : null, strike: totalVisits ? (productiveVisits / totalVisits) * 100 : null, productiveVisits };
    };
    const currentVisits = visitMetric(windows.current);
    const previousVisits = visitMetric(windows.comparison);
    const collectionsAvailability = productFiltered ? "not-applicable" : (context.datasets.Collections.available ? analysis.availability : "unavailable");
    const returnsAvailability = productFiltered ? "not-applicable" : (context.datasets.Returns.available ? analysis.availability : "unavailable");
    const visitsAvailability = productFiltered ? "not-applicable" : (context.datasets.Visits.available ? analysis.availability : "unavailable");
    return [
      metric("sales", currentSales, previousSales, invoicesAvailable ? analysis.availability : "unavailable", invoicesAvailable ? analysis.reason : "invoices-dataset-unavailable", "favorable", "fsos360.kpi.sales.change"),
      metric("collections", collectionCurrent, collectionPrevious, collectionsAvailability, productFiltered ? "filter-not-supported" : analysis.reason, "favorable", "fsos360.kpi.collections.change"),
      metric("returns", returnsCurrent, returnsPrevious, returnsAvailability, productFiltered ? "filter-not-supported" : analysis.reason, "unfavorable", "fsos360.kpi.returns.change"),
      metric("lost-sales", null, null, "pending-business-approval", "lost-sales-aggregation-and-deduplication-unapproved", "unknown"),
      metric("orders", currentOrders, previousOrders, invoicesAvailable ? analysis.availability : "unavailable", invoicesAvailable ? analysis.reason : "invoices-dataset-unavailable", "favorable", "fsos360.kpi.orders.change"),
      metric("coverage", currentVisits?.coverage ?? null, previousVisits?.coverage ?? null, visitsAvailability, productFiltered ? "filter-not-supported" : analysis.reason, "favorable", "fsos360.kpi.coverage.change"),
      metric("strike-rate", currentVisits?.strike ?? null, previousVisits?.strike ?? null, visitsAvailability, productFiltered ? "filter-not-supported" : analysis.reason, "favorable", "fsos360.kpi.strikeRate.change"),
      metric("productivity", currentVisits && currentSales !== null && currentVisits.productiveVisits ? currentSales / currentVisits.productiveVisits : null, previousVisits && previousSales !== null && previousVisits.productiveVisits ? previousSales / previousVisits.productiveVisits : null, visitsAvailability, currentVisits?.productiveVisits ? analysis.reason : "zero-denominator", "favorable", "fsos360.kpi.productivity.change"),
    ];
  }

  private timeline(currentRows: SalesRow[], previousRows: SalesRow[], currentPeriod: { from: string; to: string }, comparisonPeriod: { from: string; to: string }) {
    const bucket = (rows: SalesRow[], period: { from: string; to: string }) => {
      const from = this.window(period);
      const days = Math.ceil((from.to - from.from) / 86_400_000) + 1;
      const granularity = days <= 62 ? "day" : days <= 180 ? "week" : "month";
      const map = new Map<string, number>();
      for (const row of rows) {
        if (row.time === null) continue;
        const date = new Date(row.time);
        const key = granularity === "month"
          ? String((date.getUTCFullYear() - new Date(period.from).getUTCFullYear()) * 12 + date.getUTCMonth() - new Date(period.from).getUTCMonth())
          : granularity === "week" ? String(Math.floor((row.time - from.from) / (7 * 86_400_000))) : String(Math.floor((row.time - from.from) / 86_400_000));
        map.set(key, (map.get(key) ?? 0) + row.amount);
      }
      const startDate = new Date(period.from);
      const endDate = new Date(period.to);
      const count = granularity === "month"
        ? (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + endDate.getUTCMonth() - startDate.getUTCMonth() + 1
        : granularity === "week" ? Math.ceil(days / 7) : days;
      return { granularity, values: Array.from({ length: count }, (_, position) => ({ position, value: map.get(String(position)) ?? null })) };
    };
    const current = bucket(currentRows, currentPeriod);
    const comparison = bucket(previousRows, comparisonPeriod);
    const length = Math.max(current.values.length, comparison.values.length);
    return { granularity: current.granularity, buckets: Array.from({ length }, (_, position) => ({ position, current: current.values[position]?.value ?? null, comparison: comparison.values[position]?.value ?? null })) };
  }

  private target(context: Fsos360ResolvedContext, currentRows: SalesRow[], period: { from: string; to: string }) {
    const supported = ["company", "region", "branch", "sales-rep"].includes(context.activeAnalysisLevel);
    if (!supported) return { availability: "not-applicable", reason: "analysis-level-does-not-own-target" };
    const start = new Date(`${period.from}T00:00:00Z`);
    const end = new Date(`${period.to}T00:00:00Z`);
    const completeMonths = start.getUTCDate() === 1 && end.getUTCDate() === new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    if (!completeMonths) return { availability: "partial", reason: "partial-period" };
    if (!context.datasets.Targets.available) return { availability: "unavailable", reason: "targets-dataset-unavailable" };
    if (context.activeAnalysisLevel === "sales-rep" && !context.capabilities.routeAssignments!.available) return { availability: "unavailable", reason: "route-assignment-history-unavailable" };
    const months: { key: string; start: number; end: number }[] = [];
    for (let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
      months.push({ key: `${cursor.getUTCFullYear()}-${cursor.getUTCMonth() + 1}`, start: cursor.getTime(), end: Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999) });
    }
    const selectedReps = context.filters.salesRepIds?.length ? new Set(context.filters.salesRepIds) : null;
    const scopedRouteForMonth = (routeId: string, month: { start: number; end: number }) => {
      const route = context.routes.get(routeId);
      if (!route) return false;
      if (context.filters.routeIds?.length && !context.filters.routeIds.includes(routeId)) return false;
      if (context.filters.branchIds?.length && !context.filters.branchIds.includes(route.branchId)) return false;
      if (context.filters.customerCodes?.length && !context.filters.customerCodes.some((code) => context.customers.get(code)?.routeId === routeId)) return false;
      if (context.activeAnalysisLevel !== "sales-rep" && !selectedReps) return true;
      const assignments = context.routeAssignments.filter((assignment) => assignmentMatchesAt(assignment, routeId, month.start, selectedReps) && assignmentMatchesAt(assignment, routeId, month.end, selectedReps));
      return assignments.length === 1;
    };
    let targetValue = 0;
    const covered = new Set<string>();
    let ambiguousAssignment = false;
    for (const row of context.datasets.Targets.records) {
      const routeId = String(row.RouteID ?? "").trim();
      const year = numberOf(row.Year);
      const month = numberOf(row.Month);
      const periodMonth = months.find((item) => item.key === `${year}-${month}`);
      if (!routeId || !periodMonth) continue;
      if (!scopedRouteForMonth(routeId, periodMonth)) {
        if (context.activeAnalysisLevel === "sales-rep") ambiguousAssignment = true;
        continue;
      }
      targetValue += numberOf(row.SalesTarget) ?? 0;
      covered.add(`${routeId}:${periodMonth.key}`);
    }
    if (ambiguousAssignment) return { availability: "unavailable", reason: "route-assignment-history-unavailable" };
    const expected = Array.from(context.routes.keys()).reduce((count, routeId) => count + months.filter((month) => scopedRouteForMonth(routeId, month)).length, 0);
    if (!expected || covered.size < expected) return { availability: "partial", reason: "incomplete-target-coverage", targetRouteCount: covered.size, scopedRouteCount: expected };
    const achievementValue = currentRows.reduce((sum, row) => sum + row.amount, 0);
    return { availability: "available", reason: null, targetValue, achievementValue, achievementPercentage: targetValue ? (achievementValue / targetValue) * 100 : null, remainingValue: Math.max(targetValue - achievementValue, 0), targetRouteCount: covered.size, scopedRouteCount: expected };
  }

  private visualization(
    context: Fsos360ResolvedContext,
    currentRows: SalesRow[],
    previousRows: SalesRow[],
    windows: { current: Window; comparison: Window },
    request: VisualizationRequest | undefined,
    analysis: { availability: Fsos360Availability; reason: string | null },
  ) {
    const generatedAt = new Date().toISOString();
    const selectedType = this.defaultVisualizationType(context, request?.preferredType);
    const unavailable = () => ({
      selectedType,
      availableTypes: this.availableVisualizationTypes(context, analysis, request?.metric),
      data: null,
      meta: { totalRows: 0, generatedAt },
    });

    if (analysis.availability !== "available") return unavailable();

    const availableTypes = this.availableVisualizationTypes(context, analysis, request?.metric);
    const selectedCapability = availableTypes.find((item) => item.type === selectedType);
    if (!selectedCapability || selectedCapability.availability !== "available") return unavailable();

    if (selectedType === "timeline" || selectedType === "line") {
      const timeline = this.timeline(currentRows, previousRows, {
        from: new Date(windows.current.from).toISOString().slice(0, 10),
        to: new Date(windows.current.to).toISOString().slice(0, 10),
      }, {
        from: new Date(windows.comparison.from).toISOString().slice(0, 10),
        to: new Date(windows.comparison.to).toISOString().slice(0, 10),
      });
      return {
        selectedType,
        availableTypes,
        data: {
          kind: "series" as const,
          series: timeline.buckets.map((bucket) => ({
            key: String(bucket.position),
            label: String(bucket.position + 1),
            current: bucket.current,
            comparison: bucket.comparison,
          })),
        },
        meta: { totalRows: currentRows.length + previousRows.length, generatedAt },
      };
    }

    if (selectedType === "bar") {
      const categories = this.categoryItems(currentRows, previousRows, context);
      return {
        selectedType,
        availableTypes,
        data: { kind: "categories" as const, items: categories },
        meta: { totalRows: currentRows.length + previousRows.length, generatedAt },
      };
    }

    if (selectedType === "treemap") {
      const items = this.treemapItems(currentRows, context, request?.groupBy ?? "product");
      return {
        selectedType,
        availableTypes,
        data: { kind: "treemap" as const, groupBy: request?.groupBy ?? "product", items },
        meta: { totalRows: currentRows.length, generatedAt },
      };
    }

    if (selectedType === "customer-density") {
      const productFiltered = Boolean(context.filters.productCodes?.length || context.filters.brandValues?.length || context.filters.categoryValues?.length);
      const customerCodes = productFiltered ? new Set(currentRows.map((row) => row.customerCode)) : null;
      const scopedCustomers = Array.from(context.customers.values()).filter((customer) => (!customerCodes || customerCodes.has(customer.code)) && this.customerInScope(customer.code, context, windows.current.from));
      const geo = this.geoPoints(
        scopedCustomers.map((customer) => ({ customerCode: customer.code, value: 1, routeId: customer.routeId })),
        context,
        "density",
      );
      return {
        selectedType,
        availableTypes,
        data: { kind: "geo-points" as const, metric: "density" as const, points: geo.points },
        meta: { totalRows: scopedCustomers.length, mappedRows: geo.mappedRows, unmappedRows: geo.unmappedRows, generatedAt },
      };
    }

    if (selectedType === "coverage-map" || selectedType === "route-map") {
      const visits = this.operationRows(context, "Visits", "VisitDate", "0")
        .filter((row) => this.inWindow(row.time, windows.current) && this.operationMatches(row, context));
      const geo = this.geoPoints(
        visits.map((row) => ({ customerCode: row.customerCode, value: 1, routeId: row.routeId })),
        context,
        "coverage",
      );
      return {
        selectedType,
        availableTypes,
        data: { kind: "geo-points" as const, metric: "coverage" as const, points: geo.points },
        meta: {
          totalRows: visits.length,
          mappedRows: geo.mappedRows,
          unmappedRows: geo.unmappedRows,
          routeGeometryAvailable: false,
          generatedAt,
        },
      };
    }

    const metric = request?.metric ?? "sales";
    const sourceRows = metric === "sales"
      ? currentRows.map((row) => ({ customerCode: row.customerCode, value: row.amount, routeId: row.routeId }))
      : this.operationRows(context, metric === "collections" ? "Collections" : "Returns", metric === "collections" ? "CollectionDate" : "ReturnDate", metric === "collections" ? "Amount" : "TotalAmount")
        .filter((row) => this.inWindow(row.time, windows.current) && this.operationMatches(row, context))
        .map((row) => ({ customerCode: row.customerCode, value: row.amount, routeId: row.routeId }));
    const geo = this.geoPoints(sourceRows, context, metric);
    return {
      selectedType,
      availableTypes,
      data: { kind: "geo-points" as const, metric, points: geo.points },
      meta: { totalRows: sourceRows.length, mappedRows: geo.mappedRows, unmappedRows: geo.unmappedRows, generatedAt },
    };
  }

  private defaultVisualizationType(context: Fsos360ResolvedContext, preferred?: string) {
    if (preferred && preferred !== "auto") return preferred;
    if (context.activeAnalysisLevel === "route") return "route-map";
    if (context.activeAnalysisLevel === "category") return "bar";
    if (context.activeAnalysisLevel === "brand" || context.activeAnalysisLevel === "product") return "treemap";
    if (context.activeAnalysisLevel === "customer") return "customer-density";
    return "line";
  }

  private availableVisualizationTypes(
    context: Fsos360ResolvedContext,
    analysis: { availability: Fsos360Availability; reason: string | null },
    requestedMetric?: "sales" | "collections" | "returns",
  ): { type: string; availability: VisualizationAvailability; reason?: string | null }[] {
    const analysisReason = analysis.reason ?? "analysis-unavailable";
    const productFiltered = Boolean(context.filters.productCodes?.length || context.filters.brandValues?.length || context.filters.categoryValues?.length);
    const salesAvailable = analysis.availability === "available" && context.datasets.Invoices.available && context.datasets["Invoice Items"].available;
    const productsAvailable = salesAvailable && context.datasets.Products.available;
    const customersAvailable = context.datasets.Customers.available;
    const visitsAvailability: VisualizationAvailability = productFiltered ? "not-applicable" : analysis.availability === "available" && customersAvailable && context.datasets.Visits.available ? "available" : "unavailable";
    const collectionAvailability: VisualizationAvailability = productFiltered ? "not-applicable" : analysis.availability === "available" && customersAvailable && context.datasets.Collections.available ? "available" : "unavailable";
    const returnsAvailability: VisualizationAvailability = productFiltered ? "not-applicable" : analysis.availability === "available" && customersAvailable && context.datasets.Returns.available ? "available" : "unavailable";
    const heatAvailability = requestedMetric === "collections" ? collectionAvailability : requestedMetric === "returns" ? returnsAvailability : salesAvailable ? "available" : "unavailable";
    const heatReason = requestedMetric === "collections"
      ? productFiltered ? "product-filter-not-supported-for-collections" : "collections-dataset-unavailable"
      : requestedMetric === "returns"
        ? productFiltered ? "product-filter-not-supported-for-returns" : "returns-dataset-unavailable"
        : "invoices-dataset-unavailable";
    const visitsReason = productFiltered ? "product-filter-not-supported-for-visits" : "visits-or-customers-dataset-unavailable";
    return [
      { type: "timeline", availability: salesAvailable ? "available" : "unavailable", reason: salesAvailable ? null : analysisReason },
      { type: "line", availability: salesAvailable ? "available" : "unavailable", reason: salesAvailable ? null : analysisReason },
      { type: "bar", availability: productsAvailable ? "available" : "unavailable", reason: productsAvailable ? null : "products-or-invoices-dataset-unavailable" },
      { type: "treemap", availability: productsAvailable ? "available" : "unavailable", reason: productsAvailable ? null : "products-or-invoices-dataset-unavailable" },
      { type: "heat-map", availability: heatAvailability, reason: heatAvailability === "available" ? null : analysis.availability === "available" ? heatReason : analysisReason },
      { type: "coverage-map", availability: visitsAvailability, reason: visitsAvailability === "available" ? null : analysis.availability === "available" ? visitsReason : analysisReason },
      { type: "route-map", availability: visitsAvailability, reason: visitsAvailability === "available" ? null : analysis.availability === "available" ? visitsReason : analysisReason },
      { type: "customer-density", availability: customersAvailable ? "available" : "unavailable", reason: customersAvailable ? null : "customers-dataset-unavailable" },
    ];
  }


  private categoryItems(currentRows: SalesRow[], previousRows: SalesRow[], context: Fsos360ResolvedContext) {
    const aggregate = (rows: SalesRow[]) => {
      const totals = new Map<string, { label: string; value: number }>();
      for (const row of rows) {
        const product = context.products.get(row.productCode);
        const key = product?.category || "unclassified";
        const entry = totals.get(key) ?? { label: product?.category || "Unclassified", value: 0 };
        entry.value += row.amount;
        totals.set(key, entry);
      }
      return totals;
    };
    const current = aggregate(currentRows);
    const previous = aggregate(previousRows);
    return Array.from(new Set([...current.keys(), ...previous.keys()]))
      .map((key) => ({
        key,
        label: current.get(key)?.label ?? previous.get(key)?.label ?? key,
        current: current.get(key)?.value ?? 0,
        previous: previous.get(key)?.value ?? 0,
        change: (current.get(key)?.value ?? 0) - (previous.get(key)?.value ?? 0),
      }))
      .sort((a, b) => Math.abs(b.current) - Math.abs(a.current))
      .slice(0, MAX_CATEGORY_ITEMS);
  }

  private treemapItems(rows: SalesRow[], context: Fsos360ResolvedContext, groupBy: "product" | "brand") {
    const totals = new Map<string, { label: string; value: number }>();
    for (const row of rows) {
      const product = context.products.get(row.productCode);
      const key = groupBy === "brand" ? product?.brand || "unclassified" : row.productCode || "unclassified";
      const label = groupBy === "brand" ? product?.brand || "Unclassified" : product?.name || row.productCode || "Unclassified";
      const entry = totals.get(key) ?? { label, value: 0 };
      entry.value += row.amount;
      totals.set(key, entry);
    }
    const sorted = Array.from(totals.entries())
      .map(([key, entry]) => ({ key, label: entry.label, value: entry.value, isOther: false }))
      .sort((a, b) => b.value - a.value);
    if (sorted.length <= MAX_TREEMAP_ITEMS) return sorted;
    const top = sorted.slice(0, MAX_TREEMAP_ITEMS - 1);
    const otherValue = sorted.slice(MAX_TREEMAP_ITEMS - 1).reduce((sum, item) => sum + item.value, 0);
    return [...top, { key: "__other__", label: "__other__", value: otherValue, isOther: true }];
  }

  private customerInScope(customerCode: string, context: Fsos360ResolvedContext, at: number) {
    const customer = context.customers.get(customerCode);
    if (!customer || !this.customerMatches(customerCode, context)) return false;
    const selected = context.filters.salesRepIds?.length ? new Set(context.filters.salesRepIds) : null;
    if (!selected && context.activeAnalysisLevel !== "sales-rep") return true;
    return context.routeAssignments.some((assignment) => assignmentMatchesAt(assignment, customer.routeId, at, selected));
  }

  private geoPoints(
    rows: { customerCode: string; value: number; routeId: string }[],
    context: Fsos360ResolvedContext,
    metric: "sales" | "collections" | "returns" | "density" | "coverage",
  ) {
    const totals = new Map<string, { value: number; routeId: string }>();
    for (const row of rows) {
      const entry = totals.get(row.customerCode) ?? { value: 0, routeId: row.routeId };
      entry.value += row.value;
      if (!entry.routeId && row.routeId) entry.routeId = row.routeId;
      totals.set(row.customerCode, entry);
    }
    let unmappedRows = 0;
    const points = [];
    for (const [customerCode, entry] of totals) {
      const customer = context.customers.get(customerCode);
      const valid = customer && customer.latitude !== null && customer.longitude !== null
        && customer.latitude >= -90 && customer.latitude <= 90 && customer.longitude >= -180 && customer.longitude <= 180;
      if (!valid) {
        unmappedRows++;
        continue;
      }
      points.push({
        customerCode,
        customerName: customer.name,
        routeId: entry.routeId || customer.routeId || null,
        latitude: customer.latitude,
        longitude: customer.longitude,
        value: entry.value,
      });
    }
    const limited = points.sort((a, b) => b.value - a.value).slice(0, MAX_GEO_POINTS);
    return { points: limited, mappedRows: limited.length, unmappedRows, metric };
  }


  private executiveInsight(kpis: Fsos360Kpi[], analysis: { availability: Fsos360Availability; reason: string | null }) {
    if (analysis.availability !== "available") return { availability: analysis.availability, reason: analysis.reason, items: [] };
    const sales = kpis.find((kpi) => kpi.id === "sales");
    return { availability: "available", reason: null, items: sales?.businessMeaning ? [sales.businessMeaning] : [] };
  }
}
