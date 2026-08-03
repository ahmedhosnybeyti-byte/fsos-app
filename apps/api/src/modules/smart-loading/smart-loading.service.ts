import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import type { SmartLoadingPriorityProduct, SmartLoadingProduct, SmartLoadingSession, SmartLoadingRecalculateInput, SmartLoadingRecalculateResult } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { LostOpportunityService } from "../lost-opportunity/lost-opportunity.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";
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
//   - lastSaleDate        <- max(Invoices.InvoiceDate) per ProductCode,
//                            via Invoice Items joined to Invoices (same
//                            join shape as SGI/Team Performance)
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
const HIGH_PRIORITY_DAYS_STALE = 4;
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

  private async tryEntity(ctx: ReturnType<SmartLoadingService["rieContext"]>, entityName: string): Promise<EntityQueryResult> {
    try {
      return await this.rieFacade.getEntityRecords(entityName, ctx);
    } catch {
      // Availability is part of the response contract: swallowing a provider
      // failure as an empty list would incorrectly claim there are no
      // opportunities.
      return { entityName, available: false, records: [], fields: [], warnings: [] };
    }
  }

  async getSession(user: AuthenticatedUser, requestedTargetDate?: string): Promise<SmartLoadingSession> {
    if (!user.companyId) throw new ForbiddenException();
    const ctx = this.rieContext(user);
    const targetDate = parseTargetDate(requestedTargetDate);
    const targetDateIso = isoDay(targetDate.getTime());

    const [productsResult, customersResult, invoicesResult, invoiceItemsResult, returnsResult, returnItemsResult, vanInventoryRecords] = await Promise.all([
      this.rieFacade.getEntityRecords("Products", ctx),
      this.tryEntity(ctx, "Customers"),
      this.tryEntity(ctx, "Invoices"),
      this.tryEntity(ctx, "Invoice Items"),
      this.tryEntity(ctx, "Returns"),
      this.tryEntity(ctx, "Return Items"),
      this.rieFacade.getEntityRecords("Van Inventory", ctx),
    ]);
    const customersRecords = customersResult.records;
    const invoicesRecords = invoicesResult.records;
    const invoiceItemsRecords = invoiceItemsResult.records;
    const returnsRecords = returnsResult.records;
    const returnItemsRecords = returnItemsResult.records;
    const lostOpportunityDataUnavailable = !customersResult.available || !invoicesResult.available || !invoiceItemsResult.available;

    const vehicleStockAvailable = vanInventoryRecords.available && vanInventoryRecords.records.length > 0;

    // ---- Van Inventory -> currentVehicleStock. Latest ReportDate only
    // (a snapshot entity ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ see canonical-entities.data.ts), same pattern
    // as visit-copilot.service.ts's latestVanStockSet. RIE hierarchy
    // scoping has already narrowed `records` to routes the caller may
    // see (a SALES_REP gets only their own route's rows).
    let latestReportIso: string | null = null;
    for (const row of vanInventoryRecords.records) {
      const t = toEpochMs(row.ReportDate);
      if (t === null) continue;
      const d = isoDay(t);
      if (!latestReportIso || d > latestReportIso) latestReportIso = d;
    }
    const vehicleStockByProduct = new Map<string, number>();
    if (vehicleStockAvailable && latestReportIso) {
      for (const row of vanInventoryRecords.records) {
        const t = toEpochMs(row.ReportDate);
        if (t === null || isoDay(t) !== latestReportIso) continue;
        const productCode = String(row.ProductCode ?? "").trim();
        if (!productCode) continue;
        const qty = toFiniteNumber(row.Quantity) ?? 0;
        vehicleStockByProduct.set(productCode, (vehicleStockByProduct.get(productCode) ?? 0) + qty);
      }
    }

    // ---- Products -> category (+ name fallback).
    const productMeta = new Map<string, { name: string; category: string | null }>();
    if (productsResult.available) {
      for (const p of productsResult.records) {
        const code = String(p.ProductCode ?? "").trim();
        if (!code) continue;
        productMeta.set(code, {
          name: String(p.ProductName ?? code).trim() || code,
          category: p.Category ? String(p.Category).trim() || null : null,
        });
      }
    }

    // ---- Lost Opportunity: next-day route customers, customer/product grain.
    // Route Assignments are not a mapped RIE dataset yet, so the documented
    // current source is Customers.VisitDay. Values are normalised here rather
    // than compared as raw display text.
    const targetRouteWeekday = weekdayForDate(targetDate);
    const normalizeKey = (value: unknown) => String(value ?? "").trim();
    const nextRouteCustomers = new Map<string, string>();
    const routeCustomersByCode = new Map<string, { customerCode: string; customerName: string; routeId: string | null; visitSequence: number | null }>();
    let hasUnsupportedVisitDayFormat = false;
    for (const customer of customersRecords) {
      const rawVisitDay = normalizeKey(customer.VisitDay);
      const visitDay = normalizeVisitDay(rawVisitDay);
      if (!visitDay) {
        if (rawVisitDay) hasUnsupportedVisitDayFormat = true;
        continue;
      }
      if (visitDay !== targetRouteWeekday) continue;
      const customerCode = normalizeKey(customer.CustomerCode);
      if (!customerCode) continue;
      const customerName = normalizeKey(customer.CustomerName) || customerCode;
      nextRouteCustomers.set(customerCode, customerName);
      routeCustomersByCode.set(customerCode, { customerCode, customerName, routeId: normalizeKey(customer.RouteID) || null, visitSequence: toFiniteNumber(customer.VisitSequence) });
    }

    const lostOpportunityResult = await this.lostOpportunityService.detect({
      ...ctx,
      selectedDate: targetDateIso,
      customerCodes: [...nextRouteCustomers.keys()],
      customerNames: nextRouteCustomers,
    });
    const lostOpportunities = lostOpportunityResult.opportunities;
    const lostOpportunityReason = lostOpportunityDataUnavailable
      ? "data-unavailable"
      : nextRouteCustomers.size === 0
        ? hasUnsupportedVisitDayFormat ? "unsupported-visit-day-format" : "no-tomorrow-route-customers"
        : lostOpportunityResult.status === "no-customers" ? "no-tomorrow-route-customers" : lostOpportunityResult.status;
    // ---- Invoices -> per-InvoiceNo customer/date lookup (same join shape
    // as sgi.service.ts / team-performance.service.ts).
    const invoiceMetaByNo = new Map<string, { date: number; customerCode: string }>();
    for (const inv of invoicesRecords) {
      const no = String(inv.InvoiceNo ?? "").trim();
      const t = toEpochMs(inv.InvoiceDate);
      const customerCode = String(inv.CustomerCode ?? "").trim();
      if (no && t !== null && customerCode) invoiceMetaByNo.set(no, { date: t, customerCode });
    }

    // ---- Invoice Items joined to Invoices -> lastSaleDate + weekly
    // average, per ProductCode. lastSaleDate is the max InvoiceDate seen
    // for that product anywhere in the caller's RIE-scoped Invoice Items ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ
    // "last actual sale of the item within the caller's automatic scope",
    // exactly as specified.
    //
    // weeklyAverageSales (2026-07-28 correction, approved formula):
    // total sold Quantity over the last 3 months / 12 ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ NOT a rolling
    // 4-week window. 2026-07-28 (second correction): "last 3 months" is a
    // rolling window measured from today's exact date (now minus 3
    // calendar months, same day-of-month), not calendar-month boundaries ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ
    // e.g. run on the 28th, the window starts on the 28th three months
    // back, not the 1st of that month.
    const now = new Date();
    const threeMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS_LOOKBACK, now.getUTCDate()));
    const nowMs = now.getTime();
    const windowStartMs = threeMonthsAgo.getTime();

    const lastSaleMsByProduct = new Map<string, number>();
    const windowQtyByProduct = new Map<string, number>();
    const prioritySalesByProduct = new Map<string, { customers: Set<string>; totalQuantity: number }>();

    for (const item of invoiceItemsRecords) {
      const invoiceNo = String(item.InvoiceNo ?? "").trim();
      const invoice = invoiceMetaByNo.get(invoiceNo);
      if (!invoice || !nextRouteCustomers.has(invoice.customerCode)) continue;
      const productCode = String(item.ProductCode ?? "").trim();
      if (!productCode) continue;

      const prevLast = lastSaleMsByProduct.get(productCode);
      if (prevLast === undefined || invoice.date > prevLast) lastSaleMsByProduct.set(productCode, invoice.date);

      if (invoice.date >= windowStartMs && invoice.date <= nowMs) {
        const qty = toFiniteNumber(item.Quantity) ?? 0;
        windowQtyByProduct.set(productCode, (windowQtyByProduct.get(productCode) ?? 0) + qty);
        if (qty > 0) {
          const priority = prioritySalesByProduct.get(productCode) ?? { customers: new Set<string>(), totalQuantity: 0 };
          priority.customers.add(invoice.customerCode);
          priority.totalQuantity += qty;
          prioritySalesByProduct.set(productCode, priority);
        }
      }
    }

    // ---- Assemble one row per product the caller actually has vehicle
    // stock data for (Van Inventory is the driving set ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ a loading list is
    // inherently "what's on/should be on the van", not "every product that
    // ever existed").
    const products: SmartLoadingProduct[] = [];
    const attentionList: { id: string; message: string }[] = [];

    const sessionProductCodes = new Set([...vehicleStockByProduct.keys(), ...windowQtyByProduct.keys()]);
    for (const productCode of sessionProductCodes) {
      const currentVehicleStock = vehicleStockAvailable ? vehicleStockByProduct.get(productCode) ?? 0 : null;
      const meta = productMeta.get(productCode);
      const lastSaleMs = lastSaleMsByProduct.get(productCode) ?? null;
      const lastSaleDate = lastSaleMs !== null ? isoDay(lastSaleMs) : null;
      const weeklyAverageSales = (windowQtyByProduct.get(productCode) ?? 0) / WEEKS_DIVISOR;

      const daysSinceLastSale = lastSaleMs !== null ? Math.floor((nowMs - lastSaleMs) / MS_PER_DAY) : null;
      const isStale = daysSinceLastSale !== null && daysSinceLastSale > HIGH_PRIORITY_DAYS_STALE;

      products.push({
        productCode,
        productName: meta?.name ?? productCode,
        currentVehicleStock,
        weeklyAverageSales,
        priority: isStale ? "high" : "normal",
        category: meta?.category ?? null,
        lastSaleDate,
      });

      if (isStale && daysSinceLastSale !== null) {
        attentionList.push({
          id: productCode,
          message: `${meta?.name ?? productCode} ط£آ¢أ¢â€ڑآ¬أ¢â‚¬â€Œ ط·آ¸أ¢â‚¬â€چط·آ¸أ¢â‚¬آ¦ ط·آ¸ط¸آ¹ط·آ¸ط¹ث†ط·آ·ط¢آ¨ط·آ·ط¢آ§ط·آ·ط¢آ¹ ط·آ¸أ¢â‚¬آ¦ط·آ¸أ¢â‚¬آ ط·آ·ط¢آ° ${daysSinceLastSale} ط·آ¸ط¸آ¹ط·آ¸ط«â€ ط·آ¸أ¢â‚¬آ¦ط·آ¸أ¢â‚¬آ¹ط·آ·ط¢آ§ ط·آ·ط¢آ±ط·آ·ط·â€؛ط·آ¸أ¢â‚¬آ¦ ط·آ¸ط«â€ ط·آ·ط¢آ¬ط·آ¸ط«â€ ط·آ·ط¢آ¯ط·آ¸أ¢â‚¬طŒ ط·آ¸ط¸آ¾ط·آ¸ط¸آ¹ ط·آ¸أ¢â‚¬آ¦ط·آ·ط¢آ®ط·آ·ط¢آ²ط·آ¸ط«â€ ط·آ¸أ¢â‚¬آ  ط·آ·ط¢آ§ط·آ¸أ¢â‚¬â€چط·آ·ط¢آ³ط·آ¸ط¸آ¹ط·آ·ط¢آ§ط·آ·ط¢آ±ط·آ·ط¢آ©.`,
        });
      }
    }

    products.sort((a, b) => a.productName.localeCompare(b.productName, "ar"));

    const priorityProducts: SmartLoadingPriorityProduct[] = selectRoutePriorityProducts(
      [...prioritySalesByProduct.entries()].map(([productCode, value]) => ({
        productCode,
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
      attention: attentionList,
      calculatedAt: new Date(nowMs).toISOString(),
      asOfDate: targetDateIso,
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
