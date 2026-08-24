import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { DEFAULT_SMART_LOADING_STALE_DAYS, type SmartLoadingPriorityProduct, type SmartLoadingProduct, type SmartLoadingSession, type SmartLoadingRecalculateInput, type SmartLoadingRecalculateResult } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { LostOpportunityService } from "../lost-opportunity/lost-opportunity.service";
import { selectRoutePriorityProducts } from "./smart-loading-priority";

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

  constructor(private readonly rieFacade: RieFacade, private readonly lostOpportunityService: LostOpportunityService) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  async getSession(user: AuthenticatedUser, requestedTargetDate?: string, staleDaysThreshold = DEFAULT_SMART_LOADING_STALE_DAYS): Promise<SmartLoadingSession> {
    if (!user.companyId) throw new ForbiddenException();
    const ctx = this.rieContext(user);
    const targetDate = parseTargetDate(requestedTargetDate);
    const targetDateIso = isoDay(targetDate.getTime());
    const staleAsOfDate = targetDate;
    const now = new Date();
    const threeMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS_LOOKBACK, now.getUTCDate()));
    const nowMs = now.getTime();
    const windowStartMs = threeMonthsAgo.getTime();
    const bounded = async (query: Parameters<RieFacade["queryCanonicalRecords"]>[0]) => {
      const result = await this.rieFacade.queryCanonicalRecords({ ...query, pagination: { limit: 5_000 } });
      if (result.page.hasMore) throw new BadRequestException("Smart Loading scoped result exceeds its safe response limit.");
      return result.records;
    };

    // Each RIE call applies company + hierarchy scope in PostgreSQL. Facts
    // are grouped before leaving PostgreSQL; Node below only combines these
    // bounded, screen-sized result sets.
    const targetRouteWeekday = weekdayForDate(targetDate);
    const [routeCustomerRows, visitDayRows] = await Promise.all([
      bounded({ ...ctx, entityName: "Customers", projection: [{ field: "CustomerCode", as: "customerCode" }, { field: "CustomerName", as: "customerName" }, { field: "RouteID", as: "routeId" }, { field: "VisitSequence", as: "visitSequence" }], scope: { fields: [{ field: "VisitDay", values: VISIT_DAY_ALIASES[targetRouteWeekday] }] } }),
      bounded({ ...ctx, entityName: "Customers", projection: [{ field: "VisitDay", as: "visitDay" }], groupBy: [{ field: "VisitDay" }], aggregates: [{ op: "count", as: "count" }] }),
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

    // PostgreSQL retains each visible route's latest snapshot before grouping
    // product quantities, so this remains one bounded RIE query regardless of
    // route count.
    const inventoryRows = await bounded({ ...ctx, entityName: "Van Inventory", projection: [{ field: "RouteID", as: "routeId" }, { field: "ProductCode", as: "productCode" }], latestPer: { partitionBy: { field: "RouteID" }, orderBy: { field: "ReportDate" } }, groupBy: [{ field: "RouteID" }, { field: "ProductCode" }], aggregates: [{ op: "sum", field: "Quantity", as: "quantity" }] });
    const activeVehicleRouteIds = new Set<string>();
    const vehicleStockByProduct = new Map<string, number>();
    for (const row of inventoryRows) {
      const routeId = normalizedRouteId(row.routeId);
      if (!routeId) continue;
      activeVehicleRouteIds.add(routeId);
      const productCode = normalizedProductCode(row.productCode);
      if (productCode) vehicleStockByProduct.set(productCode, (vehicleStockByProduct.get(productCode) ?? 0) + (toFiniteNumber(row.quantity) ?? 0));
    }
    const vehicleStockAvailable = activeVehicleRouteIds.size > 0;
    const invoiceJoin = [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }] as const;
    const salesScope = { route: { values: [...activeVehicleRouteIds], source: "invoice" }, routeFallback: { primary: { field: "RouteID" }, fallback: { field: "RouteID", source: "invoice" }, values: [...activeVehicleRouteIds] }, date: { field: "InvoiceDate", source: "invoice", to: targetDateIso } } as const;
    const lastSaleRows = activeVehicleRouteIds.size ? await bounded({ ...ctx, entityName: "Invoice Items", projection: [{ field: "ProductCode", as: "productCode" }], joins: invoiceJoin, hierarchyRoute: { field: "RouteID", source: "invoice" }, groupBy: [{ field: "ProductCode" }], aggregates: [{ op: "maxText", field: "InvoiceDate", source: "invoice", as: "lastSaleDate" }], scope: salesScope }) : [];
    const lastSaleMsByProduct = new Map(lastSaleRows.map((row) => [normalizedProductCode(row.productCode), toEpochMs(row.lastSaleDate)]).filter((entry): entry is [string, number] => !!entry[0] && entry[1] !== null));
    const staleCodes = [...vehicleStockByProduct.entries()].filter(([code, stock]) => isStaleVehicleInventory(stock, lastSaleMsByProduct.get(code) ?? null, staleAsOfDate, staleDaysThreshold)).map(([code]) => code);
    const purchaseRows = staleCodes.length ? await bounded({ ...ctx, entityName: "Invoice Items", projection: [{ field: "ProductCode", as: "productCode" }, { field: "CustomerCode", source: "invoice", as: "customerCode" }], joins: invoiceJoin, hierarchyRoute: { field: "RouteID", source: "invoice" }, groupBy: [{ field: "ProductCode" }, { field: "CustomerCode", source: "invoice" }], aggregates: [{ op: "sum", field: "Quantity", filterPositiveField: { field: "Quantity" }, as: "totalQuantity" }, { op: "countDistinct", field: "InvoiceNo", filterPositiveField: { field: "Quantity" }, as: "purchaseFrequency" }, { op: "maxText", field: "InvoiceDate", source: "invoice", filterPositiveField: { field: "Quantity" }, as: "lastPurchaseDate" }], scope: { ...salesScope, product: { values: staleCodes } } }) : [];
    const priorityRows = nextRouteCustomers.size && activeVehicleRouteIds.size ? await bounded({ ...ctx, entityName: "Invoice Items", projection: [{ field: "ProductCode", as: "productCode" }, { field: "CustomerCode", source: "invoice", as: "customerCode" }], joins: invoiceJoin, hierarchyRoute: { field: "RouteID", source: "invoice" }, groupBy: [{ field: "ProductCode" }, { field: "CustomerCode", source: "invoice" }], aggregates: [{ op: "sum", field: "Quantity", as: "windowQuantity" }, { op: "sum", field: "Quantity", filterPositiveField: { field: "Quantity" }, as: "priorityQuantity" }], scope: { route: { values: [...activeVehicleRouteIds], source: "invoice" }, routeFallback: { primary: { field: "RouteID" }, fallback: { field: "RouteID", source: "invoice" }, values: [...activeVehicleRouteIds] }, customer: { values: [...nextRouteCustomers.keys()], source: "invoice" }, date: { field: "InvoiceDate", source: "invoice", from: windowStartMs, to: nowMs } } }) : [];
    const windowQtyByProduct = new Map<string, number>();
    const prioritySalesByProduct = new Map<string, { customers: Set<string>; totalQuantity: number }>();
    for (const row of priorityRows) {
      const productCode = normalizedProductCode(row.productCode), customerCode = String(row.customerCode ?? "").trim(), windowQuantity = toFiniteNumber(row.windowQuantity) ?? 0, priorityQuantity = toFiniteNumber(row.priorityQuantity) ?? 0;
      if (!productCode) continue;
      windowQtyByProduct.set(productCode, (windowQtyByProduct.get(productCode) ?? 0) + windowQuantity);
      if (priorityQuantity > 0 && customerCode) { const priority = prioritySalesByProduct.get(productCode) ?? { customers: new Set<string>(), totalQuantity: 0 }; priority.customers.add(customerCode); priority.totalQuantity += priorityQuantity; prioritySalesByProduct.set(productCode, priority); }
    }
    const sessionProductCodes = [...new Set([...vehicleStockByProduct.keys(), ...windowQtyByProduct.keys()])];
    const productRows = sessionProductCodes.length ? await bounded({ companyId: ctx.companyId, entityName: "Products", projection: [{ field: "ProductCode", as: "productCode" }, { field: "ProductName", as: "productName" }, { field: "Category", as: "category" }], scope: { product: { values: sessionProductCodes } } }) : [];
    const productMeta = new Map(productRows.map((row) => { const code = normalizedProductCode(row.productCode); return [code, { code: String(row.productCode ?? code).trim() || code, name: String(row.productName ?? row.productCode ?? code).trim() || code, category: row.category ? String(row.category).trim() || null : null }] as const; }).filter(([code]) => !!code));
    const staleCustomerCodes = [...new Set(purchaseRows.map((row) => String(row.customerCode ?? "").trim()).filter(Boolean))];
    const staleCustomerRows = staleCustomerCodes.length ? await bounded({ ...ctx, entityName: "Customers", projection: [{ field: "CustomerCode", as: "customerCode" }, { field: "CustomerName", as: "customerName" }], scope: { customer: { values: staleCustomerCodes } } }) : [];
    const customerNamesByCode = new Map(staleCustomerRows.map((row) => [String(row.customerCode ?? "").trim(), String(row.customerName ?? row.customerCode ?? "").trim()]));
    const customerPurchasesByProduct = new Map<string, Map<string, { totalQuantity: number; purchaseFrequency: number; lastPurchaseMs: number }>>();
    for (const row of purchaseRows) { const productCode = normalizedProductCode(row.productCode), customerCode = String(row.customerCode ?? "").trim(), lastPurchaseMs = toEpochMs(row.lastPurchaseDate); if (!productCode || !customerCode || lastPurchaseMs === null || (toFiniteNumber(row.totalQuantity) ?? 0) <= 0) continue; const byCustomer = customerPurchasesByProduct.get(productCode) ?? new Map(); byCustomer.set(customerCode, { totalQuantity: toFiniteNumber(row.totalQuantity) ?? 0, purchaseFrequency: toFiniteNumber(row.purchaseFrequency) ?? 0, lastPurchaseMs }); customerPurchasesByProduct.set(productCode, byCustomer); }
    const lostOpportunityResult = await this.lostOpportunityService.detect({ ...ctx, selectedDate: targetDateIso, customerCodes: [...nextRouteCustomers.keys()], customerNames: nextRouteCustomers });
    const lostOpportunities = lostOpportunityResult.opportunities;
    const lostOpportunityReason = nextRouteCustomers.size === 0 ? hasUnsupportedVisitDayFormat ? "unsupported-visit-day-format" : "no-tomorrow-route-customers" : lostOpportunityResult.status === "no-customers" ? "no-tomorrow-route-customers" : lostOpportunityResult.status;

    // ---- Assemble one row per product the caller actually has vehicle
    // stock data for (Van Inventory is the driving set ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ a loading list is
    // inherently "what's on/should be on the van", not "every product that
    // ever existed").
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
        routeCustomerCount: value.customers.size,
        totalQuantity: value.totalQuantity,
        currentVehicleStock: vehicleStockByProduct.get(productCode) ?? null,
      })),
    );
    return {
      state: "ready",
      products,
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
    const ctx = this.rieContext(user); const [customers, products, invoices, items, inventory] = await Promise.all([this.rieFacade.getEntityRecords("Customers", ctx), this.rieFacade.getEntityRecords("Products", ctx), this.rieFacade.getEntityRecords("Invoices", ctx), this.rieFacade.getEntityRecords("Invoice Items", ctx), this.rieFacade.getEntityRecords("Van Inventory", ctx)]);
    if (![customers, products, invoices, items].every((result) => result.available)) throw new BadRequestException("Required RIE data is unavailable.");
    const allowed = new Set(customers.records.map((row) => String(row.CustomerCode ?? "").trim()));
    if (input.customerCodes.some((code) => !allowed.has(code))) throw new ForbiddenException("One or more customers are outside your scope.");
    const selected = new Set(input.customerCodes.map((code) => code.trim()).filter(Boolean)); const productNames = new Map(products.records.map((row) => [String(row.ProductCode ?? "").trim(), String(row.ProductName ?? row.ProductCode ?? "").trim()]));
    if (input.confirmedOrders.some((order) => !productNames.has(order.productCode))) throw new BadRequestException("One or more confirmed-order products are unavailable in RIE.");
    const invoiceMeta = new Map(invoices.records.filter((row) => ["confirmed", "posted"].includes(String(row.InvoiceStatus ?? "").trim().toLowerCase())).map((row) => [String(row.InvoiceNo ?? "").trim(), { customer: String(row.CustomerCode ?? "").trim(), date: toEpochMs(row.InvoiceDate) }]));
    const net = new Map<string, number>(); const start = from.getTime(); const end = to.getTime() + MS_PER_DAY - 1;
    for (const row of items.records) { const invoice = invoiceMeta.get(String(row.InvoiceNo ?? "").trim()); const code = String(row.ProductCode ?? "").trim(); if (invoice?.date !== null && invoice && selected.has(invoice.customer) && invoice.date >= start && invoice.date <= end && code) net.set(code, (net.get(code) ?? 0) + (toFiniteNumber(row.Quantity) ?? 0)); }
    const latest = Math.max(...inventory.records.map((row) => toEpochMs(row.ReportDate) ?? Number.NEGATIVE_INFINITY)); const stock = new Map<string, number>(); for (const row of inventory.records) if (toEpochMs(row.ReportDate) === latest) { const code = String(row.ProductCode ?? "").trim(); stock.set(code, (stock.get(code) ?? 0) + (toFiniteNumber(row.Quantity) ?? 0)); }
    const days = Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY) + 1; const orders = new Map(input.confirmedOrders.map((row) => [row.productCode, row.quantity])); const codes = new Set([...net.keys(), ...orders.keys()]);
    return { targetDate: input.targetDate, fromDate: input.fromDate, toDate: input.toDate, calendarDaysInPeriod: days, products: [...codes].map((code) => { const demand = ((net.get(code) ?? 0) / days) * 7 / input.visitsPerWeek; const vehicleStock = stock.get(code) ?? null; const safetyStock = 0; return { productCode: code, productName: productNames.get(code) ?? code, estimatedCustomerDemand: demand, confirmedOrderQuantity: orders.get(code) ?? 0, safetyStock, vehicleStock, suggestedQuantity: demand + (orders.get(code) ?? 0) - safetyStock - (vehicleStock ?? 0) }; }), calculatedAt: new Date().toISOString() };
  }
}
