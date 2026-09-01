import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { DEFAULT_SMART_LOADING_STALE_DAYS, type SmartLoadingHierarchyOptions, type SmartLoadingManagementLoadingRiskQuery, type SmartLoadingManagementLoadingRiskResponse, type SmartLoadingManagementLostOpportunitiesQuery, type SmartLoadingManagementLostOpportunitiesResponse, type SmartLoadingManagementVehicleProduct, type SmartLoadingPriorityProduct, type SmartLoadingProduct, type SmartLoadingSession, type SmartLoadingRecalculateInput, type SmartLoadingRecalculateResult } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { CanonicalHierarchyResolverService } from "../rie/canonical-hierarchy-resolver.service";
import { PrismaService } from "../../common/prisma";
import { LostOpportunityService } from "../lost-opportunity/lost-opportunity.service";
import { selectRoutePriorityProducts } from "./smart-loading-priority";

const SMART_LOADING_TIMING_AUDIT_ENABLED = process.env.SMART_LOADING_TIMING_AUDIT === "true";

// Smart Loading ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ read-only, computed-on-request from RIE (no new table, no
// migration, no persistence, no Excel reads beyond what RieFacade already
// serves). Every field is sourced from an existing Canonical Entity, scoped
// automatically by the caller's company + role hierarchy exactly like every
// other RIE-backed module (SGI, Visit Copilot) ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ no manual scope picker.
//
// 2026-07-28: this is the FIRST real backend for Smart Loading. The
// frontend previously only had a stub (apps/web/src/lib/api/smart-loading.ts)
// that always returned "vehicle-stock-unavailable" because no approved API
// contract existed yet ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ that was an honesty placeholder, not a statement
// that the underlying data doesn't exist.
//
// Before writing this, the RIE registry was re-checked specifically for
// "Van Inventory" / "Vehicle Stock" / "Van Stock" / "Route Inventory"
// because a prior, incorrect assumption said no vehicle-stock entity
// existed at all. It does: "Van Inventory" is a real Canonical Entity
// (canonical-entities.data.ts, primaryKey ReportDate+RouteID+ProductCode+
// Unit), CONFIDENT-mapped (excel-entity-provider.mapping.ts), has an
// official import template (ReportDate/RouteID/ProductCode/Unit/Quantity/
// BatchNo/ExpiryDate ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ import-templates.data.ts), and is already read in
// production by visit-copilot.service.ts's latestVanStockSet (same
// "latest ReportDate per route, Quantity > 0" pattern reused below for
// currentVehicleStock). So all three fields below are real:
//   - category            <- Products.Category
//   - lastSaleDate        <- max(Invoices.InvoiceDate) per ProductCode and
//                            current Van Inventory RouteID, via Invoice
//                            Items joined to Invoices (same join shape as
//                            SGI/Team Performance)
//   - currentVehicleStock <- Van Inventory.Quantity at the latest
//                            ReportDate, for the caller's own RouteID(s)
//                            (RIE hierarchy scoping already narrows
//                            Van Inventory rows to routes the caller may
//                            see ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ a SALES_REP only ever gets their own).
//   - weeklyAverageSales  <- Invoice Items/Invoices, per the approved
//                            formula (2026-07-28 correction): total sold
//                            Quantity over the last 3 calendar months in
//                            scope, divided by 12 ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ NOT a rolling 4-week
//                            average. Kept as a Quantity (not a monetary
//                            LineTotal sum) because the frontend combines
//                            it directly with currentVehicleStock/
//                            confirmedOrders/safetyStock, all physical
//                            units (see smart-loading-screen.tsx's
//                            suggestedLoading formula).
// Nothing here is invented or mocked. If a required entity is unavailable,
// the affected product-level field degrades to null/0 rather than being
// fabricated, and if Van Inventory itself is entirely unavailable for the
// company, the whole session reports "vehicle-stock-unavailable" (same
// contract the frontend stub already promised).
const MONTHS_LOOKBACK = 3;
const WEEKS_DIVISOR = 12;
const MS_PER_DAY = 86_400_000;
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function companyCalendarDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))));
}

export function parseAsOfDate(value: string | undefined): Date {
  if (!value) return companyCalendarDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException("asOfDate must use YYYY-MM-DD.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || isoDay(date.getTime()) !== value) {
    throw new BadRequestException("asOfDate must be a valid calendar date.");
  }
  return date;
}

export function isStaleVehicleInventory(currentVehicleStock: number | null, lastSaleMs: number | null, staleAsOfDate: Date, staleDaysThreshold: number): boolean {
  if (currentVehicleStock === null || currentVehicleStock <= 0 || lastSaleMs === null) return false;
  return Math.floor((staleAsOfDate.getTime() - lastSaleMs) / MS_PER_DAY) > staleDaysThreshold;
}

function normalizedRouteId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizedProductCode(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isSaleOnOrBeforeTargetDate(saleMs: number, targetDateIso: string): boolean {
  return isoDay(saleMs) <= targetDateIso;
}

export function isRouteInActiveVehicleScope(itemRouteId: unknown, invoiceRouteId: unknown, activeRouteIds: ReadonlySet<string>): boolean {
  // Invoice Items is the product-level source of truth for the sales route.
  // Older imports can omit it, so use the header's snapshot RouteID only as
  // a fallback. Normalize both sources because RIE access filtering is
  // case-insensitive and a mismatch here must not silently erase sales.
  const saleRouteId = normalizedRouteId(itemRouteId) || normalizedRouteId(invoiceRouteId);
  return saleRouteId !== "" && activeRouteIds.has(saleRouteId);
}

function routeProductKey(routeId: unknown, productCode: unknown): string {
  return `${normalizedRouteId(routeId)}\u0000${normalizedProductCode(productCode)}`;
}

/**
 * Management rollups must decide staleness before routes are combined.
 * A sale of SKU X on Route A must therefore never clear stale stock of SKU X
 * on Route B. The returned set is intentionally still Product-grain because
 * that is the existing screen/API contract.
 */
export function rollupManagementStaleProductCodes(
  routeProductStock: ReadonlyMap<string, number>,
  lastSaleMsByRouteProduct: ReadonlyMap<string, number>,
  staleAsOfDate: Date,
  staleDaysThreshold: number,
): Set<string> {
  const staleProductCodes = new Set<string>();
  for (const [key, stock] of routeProductStock) {
    const [, productCode] = key.split("\u0000", 2);
    if (productCode && isStaleVehicleInventory(stock, lastSaleMsByRouteProduct.get(key) ?? null, staleAsOfDate, staleDaysThreshold)) {
      staleProductCodes.add(productCode);
    }
  }
  return staleProductCodes;
}

/** The SQL rollup owns this total; every returned Product row carries it. */
export function managementStaleRouteProductCount(rows: readonly { staleRouteProductCount: number }[]): number {
  return rows[0]?.staleRouteProductCount ?? 0;
}

export function managementStaleRouteProductCases(rows: readonly { productCode: string; staleRouteProducts: readonly { routeId: string; currentVehicleStock: number; lastSaleDate: string | null }[] }[]) {
  return rows.flatMap((row) => row.staleRouteProducts.map((routeProduct) => ({ productCode: normalizedProductCode(row.productCode), ...routeProduct })));
}

export function parseTargetDate(value: string | undefined): Date {
  const tomorrow = nextRouteDate(companyCalendarDate());
  const date = value ? parseAsOfDate(value) : tomorrow;
  if (date.getTime() < tomorrow.getTime()) {
    throw new BadRequestException("targetDate must be tomorrow or a future calendar date.");
  }
  return date;
}

export function weekdayForDate(date: Date): VisitWeekday {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date).toLowerCase() as VisitWeekday;
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export type VisitWeekday = "saturday" | "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday";

export function nextRouteDate(asOfDate: Date): Date {
  return addUtcDays(asOfDate, 1);
}

const VISIT_DAY_ALIASES: Record<VisitWeekday, readonly string[]> = {
  saturday: ["saturday", "sat", "\u0627\u0644\u0633\u0628\u062a"],
  sunday: ["sunday", "sun", "\u0627\u0644\u0623\u062d\u062f"],
  monday: ["monday", "mon", "\u0627\u0644\u0627\u062b\u0646\u064a\u0646"],
  tuesday: ["tuesday", "tue", "tues", "\u0627\u0644\u062b\u0644\u0627\u062b\u0627\u0621"],
  wednesday: ["wednesday", "wed", "\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621"],
  thursday: ["thursday", "thu", "thur", "thurs", "\u0627\u0644\u062e\u0645\u064a\u0633"],
  friday: ["friday", "fri", "\u0627\u0644\u062c\u0645\u0639\u0629"],
};

export function normalizeVisitDay(value: unknown): VisitWeekday | null {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized || /^\d+$/.test(normalized)) return null;
  return (Object.keys(VISIT_DAY_ALIASES) as VisitWeekday[]).find((weekday) => VISIT_DAY_ALIASES[weekday].includes(normalized)) ?? null;
}

function isDateInWindow(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

@Injectable()
export class SmartLoadingService {
  private readonly logger = new Logger(SmartLoadingService.name);

  constructor(private readonly rieFacade: RieFacade, private readonly lostOpportunityService: LostOpportunityService, private readonly prisma: PrismaService, private readonly hierarchyResolver: CanonicalHierarchyResolverService) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  /** Management-only: Expected Demand > current Vehicle Stock (actual loaded quantity). */
  async getManagementLoadingRisk(user: AuthenticatedUser, query: SmartLoadingManagementLoadingRiskQuery): Promise<SmartLoadingManagementLoadingRiskResponse> {
    if (!user.companyId || !["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"].includes(user.roleCode)) throw new ForbiddenException();
    const targetDate = isoDay(parseTargetDate(query.targetDate).getTime());
    const salesTo = query.salesTo ?? isoDay(companyCalendarDate().getTime());
    const salesFrom = query.salesFrom ?? isoDay(Date.UTC(new Date(`${salesTo}T00:00:00.000Z`).getUTCFullYear(), new Date(`${salesTo}T00:00:00.000Z`).getUTCMonth() - MONTHS_LOOKBACK, new Date(`${salesTo}T00:00:00.000Z`).getUTCDate()));
    if (salesFrom > salesTo) throw new BadRequestException("salesFrom must not be after salesTo.");
    const personLevel = user.roleCode === "COMPANY_ADMIN" ? "manager" : user.roleCode === "MANAGER" ? "supervisor" : "sales_rep";
    const result = await this.rieFacade.queryManagementLoadingRisk({ ...this.rieContext(user), targetDate, salesFrom, salesTo, personLevel });
    this.logger.log(JSON.stringify({
      event: "smart_loading_management_loading_risk_scope",
      currentUser: user.email,
      role: user.roleCode,
      directReportsCount: result.debug?.directReportsCount ?? 0,
      routeCount: result.debug?.routeCount ?? 0,
      loadingRiskRowsBeforeAggregation: result.debug?.loadingRiskRowsBeforeAggregation ?? 0,
    }));
    return { targetDate, salesFrom, salesTo, affectedPersonCount: result.people.length, people: result.people };
  }

  /** Management-only view of the existing Smart Loading lost-opportunity rule. */
  async getManagementLostOpportunities(user: AuthenticatedUser, query: SmartLoadingManagementLostOpportunitiesQuery): Promise<SmartLoadingManagementLostOpportunitiesResponse> {
    if (!user.companyId || !["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"].includes(user.roleCode)) throw new ForbiddenException();
    const target = parseTargetDate(query.targetDate);
    const targetDate = isoDay(target.getTime());
    const baselineFrom = isoDay(target.getTime() - 119 * MS_PER_DAY);
    const baselineTo = isoDay(target.getTime() - 30 * MS_PER_DAY);
    const recentFrom = isoDay(target.getTime() - 29 * MS_PER_DAY);
    const personLevel = user.roleCode === "COMPANY_ADMIN" ? "manager" : user.roleCode === "MANAGER" ? "supervisor" : "sales_rep";
    const result = await this.rieFacade.queryManagementLostOpportunities({
      ...this.rieContext(user),
      targetDate,
      baselineFrom,
      baselineTo,
      recentFrom,
      recentTo: targetDate,
      visitDays: VISIT_DAY_ALIASES[weekdayForDate(target)],
      personLevel,
      pagination: { limit: query.limit, offset: query.offset },
    });
    return { targetDate, ...result };
  }

  /**
   * Small hierarchy dimension for the management-only panel. Routes remains
   * the scoped base so the canonical RIE hierarchy permission is applied
   * before the Employees joins. PostgreSQL performs DISTINCT/grouping/sort;
   * no fact rows or full entity reads leave the database.
   */
  async getHierarchyOptions(user: AuthenticatedUser, managerId?: string, supervisorId?: string): Promise<SmartLoadingHierarchyOptions> {
    const ctx = this.rieContext(user);
    const clean = (value?: string) => value?.trim() || undefined;
    const selectedManagerId = clean(managerId);
    const selectedSupervisorId = clean(supervisorId);
    const joins = [
      { entityName: "Employees", alias: "rep", type: "inner" as const, on: { left: { field: "SalesRepID" }, rightField: "EmployeeID" } },
      { entityName: "Employees", alias: "supervisor", type: "inner" as const, on: { left: { field: "DirectManagerID", source: "rep" }, rightField: "EmployeeID" } },
      { entityName: "Employees", alias: "manager", type: "inner" as const, on: { left: { field: "DirectManagerID", source: "supervisor" }, rightField: "EmployeeID" } },
    ];
    const base = { ...ctx, entityName: "Routes", hierarchyRoute: { field: "RouteID" }, joins, pagination: { limit: 500 } } as const;
    const options = async (alias: "manager" | "supervisor" | "rep", scopes: readonly { field: string; source: string; values: readonly string[] }[] = []) => {
      const result = await this.rieFacade.queryCanonicalRecords({
        ...base,
        projection: [{ field: "EmployeeID", source: alias, as: "value" }, { field: "EmployeeName", source: alias, as: "label" }],
        groupBy: [{ field: "EmployeeID", source: alias }, { field: "EmployeeName", source: alias }],
        orderBy: [{ field: { field: "EmployeeName", source: alias }, direction: "asc" }],
        ...(scopes.length ? { scope: { fields: scopes } } : {}),
      });
      if (result.page.hasMore) throw new BadRequestException("Smart Loading hierarchy options exceed the safe response limit.");
      return result.records.map((row) => ({ value: String(row.value ?? "").trim(), label: String(row.label ?? row.value ?? "").trim() })).filter((option) => option.value && option.label);
    };
    const managerScope = selectedManagerId ? [{ field: "EmployeeID", source: "manager", values: [selectedManagerId] }] : [];
    const supervisorScope = selectedSupervisorId ? [{ field: "EmployeeID", source: "supervisor", values: [selectedSupervisorId] }] : [];
    const [managers, supervisors, salesReps] = await Promise.all([
      options("manager"),
      options("supervisor", managerScope),
      options("rep", [...managerScope, ...supervisorScope]),
    ]);
    return { managers, supervisors, salesReps };
  }

  private async resolveSelectedSalesRepRoutes(ctx: ReturnType<SmartLoadingService["rieContext"]>, salesRepId: string): Promise<string[]> {
    const employee = await this.prisma.employee.findFirst({
      where: { companyId: ctx.companyId, employeeCode: salesRepId },
      select: { contactEmail: true, user: { select: { email: true } } },
    });
    const salesRepEmail = employee?.user?.email ?? employee?.contactEmail;
    if (salesRepEmail) {
      const selectedRepRoutes = await this.hierarchyResolver.resolveAllowedRouteIds(ctx.companyId, { roleCode: "SALES_REP", email: salesRepEmail });
      const managerAllowedRoutes = await this.hierarchyResolver.resolveAllowedRouteIds(ctx.companyId, ctx.requestingUser);
      const routeIds = selectedRepRoutes ? [...selectedRepRoutes].map((routeId) => routeId.trim()).filter(Boolean) : [];
      if (routeIds.length === 0 || (managerAllowedRoutes && routeIds.some((routeId) => !managerAllowedRoutes.has(normalizedRouteId(routeId))))) throw new ForbiddenException();
      return routeIds;
    }

    const fallback = await this.rieFacade.queryCanonicalRecords({
      ...ctx,
      entityName: "Routes",
      hierarchyRoute: { field: "RouteID" },
      projection: [{ field: "RouteID", as: "routeId" }],
      scope: { rep: { values: [salesRepId] } },
      pagination: { limit: 500 },
    });
    if (fallback.page.hasMore) throw new BadRequestException("Smart Loading selected-rep routes exceed the safe response limit.");

    // This query is both the authorization check and the legacy fallback.
    // A rep outside the requesting manager's RIE scope must never become
    // addressable merely because they have a database assignment.
    const fallbackRouteIds = fallback.records.map((row) => String(row.routeId ?? "").trim()).filter(Boolean);
    if (fallbackRouteIds.length === 0) throw new ForbiddenException();
    return fallbackRouteIds;
  }

  /** Resolves the management filter to a small Route dimension before facts. */
  private async resolveManagementScopeRouteIds(ctx: ReturnType<SmartLoadingService["rieContext"]>, managerId?: string, supervisorId?: string, selectedRepRouteIds?: readonly string[] | null): Promise<string[] | null> {
    const selectedManagerId = managerId?.trim();
    const selectedSupervisorId = supervisorId?.trim();
    if (!selectedManagerId && !selectedSupervisorId) return selectedRepRouteIds ? [...selectedRepRouteIds] : null;
    const fields = [
      ...(selectedManagerId ? [{ field: "EmployeeID", source: "manager", values: [selectedManagerId] }] : []),
      ...(selectedSupervisorId ? [{ field: "EmployeeID", source: "supervisor", values: [selectedSupervisorId] }] : []),
    ];
    const result = await this.rieFacade.queryCanonicalRecords({
      ...ctx,
      entityName: "Routes",
      hierarchyRoute: { field: "RouteID" },
      joins: [
        { entityName: "Employees", alias: "rep", type: "inner", on: { left: { field: "SalesRepID" }, rightField: "EmployeeID" } },
        { entityName: "Employees", alias: "supervisor", type: "inner", on: { left: { field: "DirectManagerID", source: "rep" }, rightField: "EmployeeID" } },
        { entityName: "Employees", alias: "manager", type: "inner", on: { left: { field: "DirectManagerID", source: "supervisor" }, rightField: "EmployeeID" } },
      ],
      projection: [{ field: "RouteID", as: "routeId" }],
      groupBy: [{ field: "RouteID" }],
      scope: { ...(selectedRepRouteIds ? { route: { values: selectedRepRouteIds } } : {}), fields },
      pagination: { limit: 500 },
    });
    if (result.page.hasMore) throw new BadRequestException("Smart Loading management scope exceeds the safe route limit.");
    return result.records.map((row) => String(row.routeId ?? "").trim()).filter(Boolean);
  }

  async getSession(user: AuthenticatedUser, requestedTargetDate?: string, staleDaysThreshold = DEFAULT_SMART_LOADING_STALE_DAYS, salesRepId?: string, managerId?: string, supervisorId?: string): Promise<SmartLoadingSession> {
    if (!user.companyId) throw new ForbiddenException();
    const timingStartedAt = performance.now();
    const stageTimingsMs: Record<string, number> = {};
    const timed = async <T>(stage: string, operation: () => Promise<T>): Promise<T> => {
      const startedAt = performance.now();
      try {
        return await operation();
      } finally {
        stageTimingsMs[stage] = Number((performance.now() - startedAt).toFixed(1));
      }
    };
    const ctx = this.rieContext(user);
    const selectedSalesRepId = salesRepId?.trim();
    if ((selectedSalesRepId || managerId?.trim() || supervisorId?.trim()) && !["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"].includes(user.roleCode)) {
      throw new ForbiddenException();
    }
    // Resolve a selected rep once, before any fact query. The operational
    // assignment is authoritative; older companies fall back to Routes.SalesRepID.
    const selectedRepRouteIds = selectedSalesRepId
      ? await this.resolveSelectedSalesRepRoutes(ctx, selectedSalesRepId)
      : null;
    const scopedRouteIds = await this.resolveManagementScopeRouteIds(ctx, managerId, supervisorId, selectedRepRouteIds);
    // Sales Rep keeps the established Product-grain behavior. Management
    // views roll up only after Stale has been evaluated per Route × Product.
    const useManagementStaleGrain = user.roleCode !== "SALES_REP";
    const withSelectedRepScope = <T extends Parameters<RieFacade["queryCanonicalRecords"]>[0]>(query: T): T => {
      if (!scopedRouteIds) return query;
      return {
        ...query,
        scope: {
          ...query.scope,
          route: { values: scopedRouteIds },
        },
      } as T;
    };
    const targetDate = parseTargetDate(requestedTargetDate);
    const targetDateIso = isoDay(targetDate.getTime());
    const staleAsOfDate = targetDate;
    const now = new Date();
    const threeMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS_LOOKBACK, now.getUTCDate()));
    const nowMs = now.getTime();
    const windowStartMs = threeMonthsAgo.getTime();
    const bounded = async (queryName: string, query: Parameters<RieFacade["queryCanonicalRecords"]>[0]) => {
      const result = await this.rieFacade.queryCanonicalRecords({ ...query, pagination: { limit: 5_000 } });
      if (result.page.hasMore) {
        this.logger.warn(`[SMART_LOADING_LIMIT_DIAG] queryName=${queryName} limit=${result.page.limit} hasMore=${result.page.hasMore}`);
        throw new BadRequestException("Smart Loading scoped result exceeds its safe response limit.");
      }
      return result.records;
    };

    // Each RIE call applies company + hierarchy scope in PostgreSQL. Facts
    // are grouped before leaving PostgreSQL; Node below only combines these
    // bounded, screen-sized result sets.
    const targetRouteWeekday = weekdayForDate(targetDate);
    const [routeCustomerRows, visitDayRows] = await Promise.all([
      timed("route-customers", () => bounded("route-customers", withSelectedRepScope({ ...ctx, entityName: "Customers", projection: [{ field: "CustomerCode", as: "customerCode" }, { field: "CustomerName", as: "customerName" }, { field: "RouteID", as: "routeId" }, { field: "VisitSequence", as: "visitSequence" }], scope: { fields: [{ field: "VisitDay", values: VISIT_DAY_ALIASES[targetRouteWeekday] }] } }))),
      timed("visit-day-aggregation", () => bounded("visit-day-aggregation", withSelectedRepScope({ ...ctx, entityName: "Customers", projection: [{ field: "VisitDay", as: "visitDay" }], groupBy: [{ field: "VisitDay" }], aggregates: [{ op: "count", as: "count" }] }))),
    ]);
    const nextRouteCustomers = new Map<string, string>();
    const routeCustomersByCode = new Map<string, { customerCode: string; customerName: string; routeId: string | null; visitSequence: number | null }>();
    for (const row of routeCustomerRows) {
      const customerCode = String(row.customerCode ?? "").trim();
      if (!customerCode) continue;
      const customerName = String(row.customerName ?? customerCode).trim() || customerCode;
      nextRouteCustomers.set(customerCode, customerName);
      routeCustomersByCode.set(customerCode, { customerCode, customerName, routeId: String(row.routeId ?? "").trim() || null, visitSequence: toFiniteNumber(row.visitSequence) });
    }
    const hasUnsupportedVisitDayFormat = visitDayRows.some((row) => {
      const value = String(row.visitDay ?? "").trim();
      return !!value && !normalizeVisitDay(value);
    });

    // Management keeps Route × Product inside RIE/PostgreSQL and receives
    // only the established Product-grain result. Sales Rep remains unchanged.
    const [activeVehicleRouteRows, inventoryRows, managementStaleRows, managementStockAlignment, managementVehicleRows] = await Promise.all([
      timed("active-vehicle-routes", () => bounded("active-vehicle-routes", withSelectedRepScope({ ...ctx, entityName: "Van Inventory", projection: [{ field: "RouteID", as: "routeId" }], groupBy: [{ field: "RouteID" }], aggregates: [{ op: "maxText", field: "ReportDate", as: "latestReportDate" }], scope: { date: { field: "ReportDate", to: targetDateIso } } }))),
      useManagementStaleGrain
        ? Promise.resolve([])
        : timed("latest-inventory", () => bounded("latest-inventory", withSelectedRepScope({ ...ctx, entityName: "Van Inventory", projection: [{ field: "ProductCode", as: "productCode" }], latestPer: { partitionBy: { field: "RouteID" }, orderBy: { field: "ReportDate" } }, groupBy: [{ field: "ProductCode" }], aggregates: [{ op: "sum", field: "Quantity", as: "quantity" }], scope: { date: { field: "ReportDate", to: targetDateIso } } }))),
      useManagementStaleGrain
        ? timed("management-stale-rollup", () => this.rieFacade.queryRouteProductStaleness({ ...ctx, routeIds: scopedRouteIds, targetDate: targetDateIso, staleDaysThreshold }))
        : Promise.resolve([]),
      useManagementStaleGrain
        ? timed("management-stock-alignment", () => this.rieFacade.queryManagementStockAlignment({ ...ctx, routeIds: scopedRouteIds, targetDate: targetDateIso, salesFrom: isoDay(windowStartMs), salesTo: isoDay(nowMs), customerCodes: [...nextRouteCustomers.keys()] }))
        : Promise.resolve(null),
      useManagementStaleGrain
        ? timed("management-vehicle-products", () => this.rieFacade.queryManagementVehicleProducts({ ...ctx, routeIds: scopedRouteIds, targetDate: targetDateIso, salesFrom: isoDay(windowStartMs), salesTo: isoDay(nowMs), customerCodes: [...nextRouteCustomers.keys()] }))
        : Promise.resolve([]),
    ]);
    const activeVehicleRouteIds = new Set<string>();
    const vehicleStockByProduct = new Map<string, number>();
    for (const row of activeVehicleRouteRows) {
      const routeId = normalizedRouteId(row.routeId);
      if (!routeId) continue;
      activeVehicleRouteIds.add(routeId);
    }
    for (const row of useManagementStaleGrain ? managementStaleRows : inventoryRows) {
      const productCode = normalizedProductCode(row.productCode);
      const quantity = toFiniteNumber(row.quantity) ?? 0;
      if (!productCode) continue;
      vehicleStockByProduct.set(productCode, (vehicleStockByProduct.get(productCode) ?? 0) + quantity);
    }
    const vehicleStockAvailable = activeVehicleRouteIds.size > 0;
    const invoiceJoin = [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }] as const;
    const salesScope = { route: { values: [...activeVehicleRouteIds], source: "invoice" }, routeFallback: { primary: { field: "RouteID" }, fallback: { field: "RouteID", source: "invoice" }, values: [...activeVehicleRouteIds] }, date: { field: "InvoiceDate", source: "invoice", to: targetDateIso } } as const;
    const lastSaleRows = !useManagementStaleGrain && activeVehicleRouteIds.size ? await timed("sales-last-sale-aggregation", () => bounded("sales-last-sale-aggregation", { ...ctx, entityName: "Invoice Items", projection: [{ field: "ProductCode", as: "productCode" }], joins: invoiceJoin, hierarchyRoute: { field: "RouteID", source: "invoice" }, groupBy: [{ field: "ProductCode" }], aggregates: [{ op: "maxText", field: "InvoiceDate", source: "invoice", as: "lastSaleDate" }], scope: salesScope, driveBaseFromScopedJoins: true })) : [];
    const lastSaleMsByProduct = new Map<string, number>();
    for (const row of lastSaleRows) {
      const productCode = normalizedProductCode(row.productCode);
      const lastSaleMs = toEpochMs(row.lastSaleDate);
      if (productCode && lastSaleMs !== null && lastSaleMs > (lastSaleMsByProduct.get(productCode) ?? Number.NEGATIVE_INFINITY)) {
        lastSaleMsByProduct.set(productCode, lastSaleMs);
      }
    }
    if (useManagementStaleGrain) {
      for (const row of managementStaleRows) {
        const productCode = normalizedProductCode(row.productCode);
        const lastSaleMs = toEpochMs(row.lastSaleDate);
        if (productCode && lastSaleMs !== null) lastSaleMsByProduct.set(productCode, lastSaleMs);
      }
    }
    const staleCodes = useManagementStaleGrain
      ? managementStaleRows.filter((row) => row.isStale).map((row) => normalizedProductCode(row.productCode)).filter(Boolean)
      : [...vehicleStockByProduct.entries()].filter(([code, stock]) => isStaleVehicleInventory(stock, lastSaleMsByProduct.get(code) ?? null, staleAsOfDate, staleDaysThreshold)).map(([code]) => code);
    const staleCount = useManagementStaleGrain
      ? managementStaleRouteProductCount(managementStaleRows)
      : staleCodes.length;
    const purchaseRows = staleCodes.length ? await timed("stale-purchases", () => this.rieFacade.queryStalePurchases({ ...ctx, routeIds: [...activeVehicleRouteIds], productCodes: staleCodes, targetDate: targetDateIso })) : [];
    // The screen consumes priority evidence at Product grain.  Grouping by
    // Product × Customer made an admin-wide result exceed the bounded RIE
    // response contract even though the final UI only uses each product's
    // positive-customer count and quantities.  Keep those exact aggregates
    // in PostgreSQL so Node receives one small row per product.
    const priorityRows = nextRouteCustomers.size && activeVehicleRouteIds.size ? await timed("priority-sales-aggregation", () => bounded("priority-sales-aggregation", { ...ctx, entityName: "Invoice Items", projection: [{ field: "ProductCode", as: "productCode" }], joins: invoiceJoin, hierarchyRoute: { field: "RouteID", source: "invoice" }, groupBy: [{ field: "ProductCode" }], aggregates: [{ op: "sum", field: "Quantity", as: "windowQuantity" }, { op: "sum", field: "Quantity", filterPositiveField: { field: "Quantity" }, as: "priorityQuantity" }, { op: "countDistinct", field: "CustomerCode", source: "invoice", filterPositiveField: { field: "Quantity" }, as: "priorityCustomerCount" }], scope: { route: { values: [...activeVehicleRouteIds], source: "invoice" }, routeFallback: { primary: { field: "RouteID" }, fallback: { field: "RouteID", source: "invoice" }, values: [...activeVehicleRouteIds] }, customer: { values: [...nextRouteCustomers.keys()], source: "invoice" }, date: { field: "InvoiceDate", source: "invoice", from: windowStartMs, to: nowMs } } })) : [];
    const windowQtyByProduct = new Map<string, number>();
    const prioritySalesByProduct = new Map<string, { customerCount: number; totalQuantity: number }>();
    for (const row of priorityRows) {
      const productCode = normalizedProductCode(row.productCode), windowQuantity = toFiniteNumber(row.windowQuantity) ?? 0, priorityQuantity = toFiniteNumber(row.priorityQuantity) ?? 0, priorityCustomerCount = toFiniteNumber(row.priorityCustomerCount) ?? 0;
      if (!productCode) continue;
      windowQtyByProduct.set(productCode, (windowQtyByProduct.get(productCode) ?? 0) + windowQuantity);
      if (priorityQuantity > 0 && priorityCustomerCount > 0) prioritySalesByProduct.set(productCode, { customerCount: priorityCustomerCount, totalQuantity: priorityQuantity });
    }
    const sessionProductCodes = [...new Set([...vehicleStockByProduct.keys(), ...windowQtyByProduct.keys()])];
    const productRows = sessionProductCodes.length ? await timed("products-lookup", () => bounded("products-lookup", { companyId: ctx.companyId, entityName: "Products", projection: [{ field: "ProductCode", as: "productCode" }, { field: "ProductName", as: "productName" }, { field: "Category", as: "category" }], scope: { product: { values: sessionProductCodes } } })) : [];
    const productMeta = new Map(productRows.map((row) => { const code = normalizedProductCode(row.productCode); return [code, { code: String(row.productCode ?? code).trim() || code, name: String(row.productName ?? row.productCode ?? code).trim() || code, category: row.category ? String(row.category).trim() || null : null }] as const; }).filter(([code]) => !!code));
    const managementVehicleProducts: SmartLoadingManagementVehicleProduct[] | null = useManagementStaleGrain
      ? managementVehicleRows.map((row) => {
        const productCode = normalizedProductCode(row.productCode);
        const meta = productMeta.get(productCode);
        return {
          productCode: meta?.code ?? productCode,
          productName: meta?.name ?? productCode,
          category: meta?.category ?? null,
          currentVehicleStock: toFiniteNumber(row.currentVehicleStock) ?? 0,
          weeklyAverageSales: toFiniteNumber(row.weeklyAverageSales) ?? 0,
          alignmentPercent: toFiniteNumber(row.alignmentPercent) ?? 0,
        };
      }).filter((product) => !!product.productCode)
      : null;
    const managementStaleRouteProducts = useManagementStaleGrain
      ? await timed("management-stale-route-people", async () => {
        const staleRouteProducts = managementStaleRouteProductCases(managementStaleRows)
          .filter((routeProduct) => routeProduct.productCode && routeProduct.lastSaleDate !== null);
        const staleRouteIds = [...new Set(staleRouteProducts.map((routeProduct) => normalizedRouteId(routeProduct.routeId)).filter(Boolean))];
        const responsiblePersonAlias = user.roleCode === "COMPANY_ADMIN" ? "manager" : user.roleCode === "MANAGER" ? "supervisor" : "rep";
        const responsiblePeople = staleRouteIds.length
          ? await bounded("management-stale-route-people", {
            ...ctx,
            entityName: "Routes",
            projection: [
              { field: "RouteID", as: "routeId" },
              { field: "EmployeeID", source: responsiblePersonAlias, as: "responsibleEmployeeId" },
              { field: "EmployeeName", source: responsiblePersonAlias, as: "responsibleEmployeeName" },
            ],
            joins: [
              { entityName: "Employees", alias: "rep", type: "inner", on: { left: { field: "SalesRepID" }, rightField: "EmployeeID" } },
              { entityName: "Employees", alias: "supervisor", type: "left", on: { left: { field: "SupervisorID" }, rightField: "EmployeeID" } },
              { entityName: "Employees", alias: "manager", type: "left", on: { left: { field: "ManagerID" }, rightField: "EmployeeID" } },
            ],
            groupBy: [
              { field: "RouteID" },
              { field: "EmployeeID", source: responsiblePersonAlias },
              { field: "EmployeeName", source: responsiblePersonAlias },
            ],
            scope: { route: { values: staleRouteIds } },
          })
          : [];
        const personByRouteId = new Map(responsiblePeople.map((person) => [
          normalizedRouteId(person.routeId),
          {
            employeeId: String(person.responsibleEmployeeId ?? "").trim(),
            employeeName: String(person.responsibleEmployeeName ?? person.responsibleEmployeeId ?? "").trim(),
          },
        ]));

        // This only exposes the same route-to-direct-report relationship used
        // by Loading Risk. Stale classification and Route × Product rollup stay
        // entirely in the established Stale Inventory engine.
        return staleRouteProducts.flatMap((routeProduct) => {
          const person = personByRouteId.get(normalizedRouteId(routeProduct.routeId));
          if (!person?.employeeId || !person.employeeName) return [];
          const meta = productMeta.get(routeProduct.productCode);
          return [{
            routeId: routeProduct.routeId,
            responsibleEmployeeId: person.employeeId,
            responsibleEmployeeName: person.employeeName,
            productCode: meta?.code ?? routeProduct.productCode,
            productName: meta?.name ?? routeProduct.productCode,
            category: meta?.category ?? null,
            currentVehicleStock: routeProduct.currentVehicleStock,
            lastSaleDate: routeProduct.lastSaleDate!,
          }];
        });
      })
      : null;
    const customerPurchasesByProduct = new Map<string, Map<string, { totalQuantity: number; purchaseFrequency: number; lastPurchaseMs: number }>>();
    const customerNamesByCode = new Map<string, string>();
    for (const row of purchaseRows) for (const purchase of row.customers ?? []) { const productCode = normalizedProductCode(row.productCode), customerCode = String(purchase.customerCode ?? "").trim(), lastPurchaseMs = toEpochMs(purchase.lastPurchaseDate); if (!productCode || !customerCode || lastPurchaseMs === null || (toFiniteNumber(purchase.totalQuantity) ?? 0) <= 0) continue; const byCustomer = customerPurchasesByProduct.get(productCode) ?? new Map(); byCustomer.set(customerCode, { totalQuantity: toFiniteNumber(purchase.totalQuantity) ?? 0, purchaseFrequency: toFiniteNumber(purchase.purchaseFrequency) ?? 0, lastPurchaseMs }); customerPurchasesByProduct.set(productCode, byCustomer); customerNamesByCode.set(customerCode, String(purchase.customerName ?? customerCode).trim() || customerCode); }
    const lostOpportunityResult = await timed("lost-opportunities", () => this.lostOpportunityService.detect({ ...ctx, selectedDate: targetDateIso, customerCodes: [...nextRouteCustomers.keys()], customerNames: nextRouteCustomers }));
    const lostOpportunityRouteIds = [...new Set(lostOpportunityResult.opportunities.map((opportunity) => normalizedRouteId(routeCustomersByCode.get(opportunity.customerCode)?.routeId)).filter(Boolean))];
    const lostOpportunityProductCodes = [...new Set(lostOpportunityResult.opportunities.map((opportunity) => normalizedProductCode(opportunity.productCode)).filter(Boolean))];
    const lostOpportunityStockRows = lostOpportunityRouteIds.length && lostOpportunityProductCodes.length
      ? await timed("lost-opportunity-route-product-stock", () => bounded("lost-opportunity-route-product-stock", withSelectedRepScope({ ...ctx, entityName: "Van Inventory", projection: [{ field: "RouteID", as: "routeId" }, { field: "ProductCode", as: "productCode" }], latestPer: { partitionBy: { field: "RouteID" }, orderBy: { field: "ReportDate" } }, groupBy: [{ field: "RouteID" }, { field: "ProductCode" }], aggregates: [{ op: "sum", field: "Quantity", as: "quantity" }], scope: { route: { values: lostOpportunityRouteIds }, product: { values: lostOpportunityProductCodes } } })))
      : [];
    const lostOpportunityStockByRouteProduct = new Map(lostOpportunityStockRows.map((row) => [`${normalizedRouteId(row.routeId)}\u0000${normalizedProductCode(row.productCode)}`, toFiniteNumber(row.quantity) ?? 0] as const));
    const lostOpportunities = lostOpportunityResult.opportunities.filter((opportunity) => {
      const routeId = normalizedRouteId(routeCustomersByCode.get(opportunity.customerCode)?.routeId);
      return !!routeId && (lostOpportunityStockByRouteProduct.get(`${routeId}\u0000${normalizedProductCode(opportunity.productCode)}`) ?? 0) <= 0;
    });
    const lostOpportunityReason = nextRouteCustomers.size === 0 ? hasUnsupportedVisitDayFormat ? "unsupported-visit-day-format" : "no-tomorrow-route-customers" : lostOpportunityResult.status === "no-customers" ? "no-tomorrow-route-customers" : lostOpportunityResult.status;

    // ---- Assemble one row per product the caller actually has vehicle
    // stock data for (Van Inventory is the driving set ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ a loading list is
    // inherently "what's on/should be on the van", not "every product that
    // ever existed").
    const calculationsStartedAt = performance.now();
    const products: SmartLoadingProduct[] = [];
    const attentionList: { id: string; message: string }[] = [];

    for (const productCode of sessionProductCodes) {
      const currentVehicleStock = vehicleStockAvailable ? vehicleStockByProduct.get(productCode) ?? 0 : null;
      const meta = productMeta.get(productCode);
      const lastSaleMs = lastSaleMsByProduct.get(productCode) ?? null;
      const lastSaleDate = lastSaleMs !== null ? isoDay(lastSaleMs) : null;
      const weeklyAverageSales = (windowQtyByProduct.get(productCode) ?? 0) / WEEKS_DIVISOR;
      const isStale = isStaleVehicleInventory(currentVehicleStock, lastSaleMs, staleAsOfDate, staleDaysThreshold);


      products.push({
        productCode: meta?.code ?? productCode,
        productName: meta?.name ?? productCode,
        currentVehicleStock,
        weeklyAverageSales,
        priority: "normal",
        category: meta?.category ?? null,
        lastSaleDate,
        isStale,
      });

    }

    products.sort((a, b) => a.productName.localeCompare(b.productName, "ar"));

    const staleProductPlans = products
      .filter((product) => product.isStale)
      .map((product) => {
        const customerPurchases = [...(customerPurchasesByProduct.get(normalizedProductCode(product.productCode))?.entries() ?? [])];
        const maxFrequency = Math.max(...customerPurchases.map(([, purchase]) => purchase.purchaseFrequency), 1);
        const maxQuantity = Math.max(...customerPurchases.map(([, purchase]) => purchase.totalQuantity), 1);
        const earliestPurchaseMs = Math.min(...customerPurchases.map(([, purchase]) => purchase.lastPurchaseMs), 0);
        const latestPurchaseMs = Math.max(...customerPurchases.map(([, purchase]) => purchase.lastPurchaseMs), 0);

        const customers = customerPurchases
          .map(([customerCode, purchase]) => {
            // Normalize each signal before combining it so quantity units do
            // not overpower invoice frequency or purchase recency.
            const recency = latestPurchaseMs === earliestPurchaseMs
              ? 1
              : (purchase.lastPurchaseMs - earliestPurchaseMs) / (latestPurchaseMs - earliestPurchaseMs);
            return {
              customerCode,
              customerName: customerNamesByCode.get(customerCode) || customerCode,
              totalQuantity: purchase.totalQuantity,
              purchaseFrequency: purchase.purchaseFrequency,
              lastPurchaseDate: isoDay(purchase.lastPurchaseMs),
              rankingScore: purchase.purchaseFrequency / maxFrequency + purchase.totalQuantity / maxQuantity + recency,
            };
          })
          .sort((a, b) => b.rankingScore - a.rankingScore || b.purchaseFrequency - a.purchaseFrequency || b.totalQuantity - a.totalQuantity || b.lastPurchaseDate.localeCompare(a.lastPurchaseDate) || a.customerName.localeCompare(b.customerName, "ar"))
          .map(({ rankingScore: _rankingScore, ...customer }) => customer);

        return {
          productCode: product.productCode,
          productName: product.productName,
          category: product.category,
          currentVehicleStock: product.currentVehicleStock!,
          lastSaleDate: product.lastSaleDate!,
          customers,
        };
      });

    const priorityProducts: SmartLoadingPriorityProduct[] = selectRoutePriorityProducts(
      [...prioritySalesByProduct.entries()].map(([productCode, value]) => ({
        productCode: productMeta.get(productCode)?.code ?? productCode,
        productName: productMeta.get(productCode)?.name ?? productCode,
        category: productMeta.get(productCode)?.category ?? null,
        routeCustomerCount: value.customerCount,
        totalQuantity: value.totalQuantity,
        currentVehicleStock: vehicleStockByProduct.get(productCode) ?? null,
      })),
    );
    stageTimingsMs["priority-recommendation-calculations"] = Number((performance.now() - calculationsStartedAt).toFixed(1));
    stageTimingsMs.total = Number((performance.now() - timingStartedAt).toFixed(1));
    if (SMART_LOADING_TIMING_AUDIT_ENABLED) {
      this.logger.log(JSON.stringify({ event: "smart_loading_session_timing", companyId: ctx.companyId, timingsMs: stageTimingsMs }));
    }
    return {
      state: "ready",
      products,
      managementVehicleProducts,
      managementStockAlignmentPercent: managementStockAlignment?.alignmentPercent ?? null,
      managementCategoryStockAlignments: managementStockAlignment?.categoryAlignments ?? null,
      staleCount,
      managementStaleRouteProducts,
      staleProductPlans,
      attention: attentionList,
      calculatedAt: new Date(nowMs).toISOString(),
      asOfDate: targetDateIso,
      staleAsOfDate: isoDay(staleAsOfDate.getTime()),
      staleDaysThreshold,
      targetDate: targetDateIso,
      route: nextRouteCustomers.size > 0 ? { targetDate: targetDateIso, customerCount: nextRouteCustomers.size } : null,
      routeCustomers: [...routeCustomersByCode.values()].sort((a, b) => (a.visitSequence ?? Number.MAX_SAFE_INTEGER) - (b.visitSequence ?? Number.MAX_SAFE_INTEGER) || a.customerName.localeCompare(b.customerName, "ar")),
      priorityProducts,
      lostOpportunities,
      lostOpportunityReason,
    };
  }
  async searchCustomers(user: AuthenticatedUser, query?: string, excludedCodes: readonly string[] = []) {
    const result = await this.rieFacade.getEntityRecords("Customers", this.rieContext(user));
    const excluded = new Set(excludedCodes.map((value) => String(value).trim()));
    const needle = String(query ?? "").trim().toLowerCase();
    return { customers: result.records.map((row) => ({ customerCode: String(row.CustomerCode ?? "").trim(), customerName: String(row.CustomerName ?? row.CustomerCode ?? "").trim(), routeId: String(row.RouteID ?? "").trim() || null, visitSequence: toFiniteNumber(row.VisitSequence) })).filter((row) => row.customerCode && !excluded.has(row.customerCode) && (!needle || row.customerCode.toLowerCase().includes(needle) || row.customerName.toLowerCase().includes(needle))).sort((a, b) => a.customerName.localeCompare(b.customerName, "ar")) };
  }

  async recalculate(user: AuthenticatedUser, input: SmartLoadingRecalculateInput): Promise<SmartLoadingRecalculateResult> {
    const from = parseAsOfDate(input.fromDate); const to = parseAsOfDate(input.toDate);
    if (from > to) throw new BadRequestException("toDate must be on or after fromDate.");
    const ctx = this.rieContext(user);
    const selectedSalesRepId = input.salesRepId?.trim();
    if (selectedSalesRepId && !["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"].includes(user.roleCode)) throw new ForbiddenException();
    const selectedRepRouteIds = selectedSalesRepId ? await this.resolveSelectedSalesRepRoutes(ctx, selectedSalesRepId) : null;
    const withSelectedRepScope = <T extends Parameters<RieFacade["queryCanonicalRecords"]>[0]>(query: T): T => {
      if (!selectedRepRouteIds) return query;
      return { ...query, scope: { ...query.scope, route: { values: selectedRepRouteIds } } } as T;
    };
    const bounded = async (query: Parameters<RieFacade["queryCanonicalRecords"]>[0]) => {
      const result = await this.rieFacade.queryCanonicalRecords({ ...query, pagination: { limit: 5_000 } });
      if (result.page.hasMore) throw new BadRequestException("Smart Loading scoped result exceeds its safe response limit.");
      return result.records;
    };
    if (!await this.rieFacade.hasCanonicalEntitySources(ctx, ["Customers", "Products", "Invoices", "Invoice Items"])) {
      throw new BadRequestException("Required RIE data is unavailable.");
    }
    const requestedCustomerCodes = [...new Set(input.customerCodes.map((code) => code.trim()).filter(Boolean))];
    const customerRows = await bounded(withSelectedRepScope({ ...ctx, entityName: "Customers", projection: [{ field: "CustomerCode", as: "customerCode" }], scope: { customer: { values: requestedCustomerCodes } } }));
    const allowed = new Set(customerRows.map((row) => String(row.customerCode ?? "").trim()));
    if (input.customerCodes.some((code) => !allowed.has(code))) throw new ForbiddenException("One or more customers are outside your scope.");
    const [salesRows, latestInventoryRows] = await Promise.all([
      bounded(withSelectedRepScope({ ...ctx, entityName: "Invoice Items", projection: [{ field: "ProductCode", as: "productCode" }], joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }], hierarchyRoute: { field: "RouteID", source: "invoice" }, groupBy: [{ field: "ProductCode" }], aggregates: [{ op: "sum", field: "Quantity", as: "netQuantity" }], scope: { customer: { values: requestedCustomerCodes, source: "invoice" }, date: { field: "InvoiceDate", source: "invoice", from: input.fromDate, to: input.toDate }, fields: [{ field: "InvoiceStatus", source: "invoice", values: ["Confirmed", "Posted"] }] } })),
      bounded(withSelectedRepScope({ ...ctx, entityName: "Van Inventory", projection: [], aggregates: [{ op: "maxText", field: "ReportDate", as: "latestReportDate" }] })),
    ]);
    const latestReportDate = String(latestInventoryRows[0]?.latestReportDate ?? "").trim().slice(0, 10);
    const inventoryRows = latestReportDate
      ? await bounded(withSelectedRepScope({ ...ctx, entityName: "Van Inventory", projection: [{ field: "ProductCode", as: "productCode" }], groupBy: [{ field: "ProductCode" }], aggregates: [{ op: "sum", field: "Quantity", as: "quantity" }], scope: { date: { field: "ReportDate", values: [latestReportDate] } } }))
      : [];
    const net = new Map<string, number>();
    for (const row of salesRows) { const code = String(row.productCode ?? "").trim(); if (code) net.set(code, toFiniteNumber(row.netQuantity) ?? 0); }
    const stock = new Map<string, number>();
    for (const row of inventoryRows) { const code = String(row.productCode ?? "").trim(); if (code) stock.set(code, toFiniteNumber(row.quantity) ?? 0); }
    const days = Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY) + 1; const orders = new Map(input.confirmedOrders.map((row) => [row.productCode, row.quantity])); const codes = new Set([...net.keys(), ...orders.keys()]);
    const productRows = codes.size ? await bounded({ companyId: ctx.companyId, entityName: "Products", projection: [{ field: "ProductCode", as: "productCode" }, { field: "ProductName", as: "productName" }], scope: { product: { values: [...codes] } } }) : [];
    const productNames = new Map(productRows.map((row) => [String(row.productCode ?? "").trim(), String(row.productName ?? row.productCode ?? "").trim()]));
    if (input.confirmedOrders.some((order) => !productNames.has(order.productCode))) throw new BadRequestException("One or more confirmed-order products are unavailable in RIE.");
    return { targetDate: input.targetDate, fromDate: input.fromDate, toDate: input.toDate, calendarDaysInPeriod: days, products: [...codes].map((code) => { const demand = ((net.get(code) ?? 0) / days) * 7 / input.visitsPerWeek; const vehicleStock = stock.get(code) ?? null; const safetyStock = 0; return { productCode: code, productName: productNames.get(code) ?? code, estimatedCustomerDemand: demand, confirmedOrderQuantity: orders.get(code) ?? 0, safetyStock, vehicleStock, suggestedQuantity: demand + (orders.get(code) ?? 0) - safetyStock - (vehicleStock ?? 0) }; }), calculatedAt: new Date().toISOString() };
  }
}
