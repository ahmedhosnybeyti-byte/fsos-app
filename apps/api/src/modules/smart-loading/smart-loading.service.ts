import { ForbiddenException, Injectable } from "@nestjs/common";
import type { SmartLoadingProduct, SmartLoadingSession } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityRecord } from "../rie/entity-provider.interface";

// Smart Loading — read-only, computed-on-request from RIE (no new table, no
// migration, no persistence, no Excel reads beyond what RieFacade already
// serves). Every field is sourced from an existing Canonical Entity, scoped
// automatically by the caller's company + role hierarchy exactly like every
// other RIE-backed module (SGI, Visit Copilot) — no manual scope picker.
//
// 2026-07-28: this is the FIRST real backend for Smart Loading. The
// frontend previously only had a stub (apps/web/src/lib/api/smart-loading.ts)
// that always returned "vehicle-stock-unavailable" because no approved API
// contract existed yet — that was an honesty placeholder, not a statement
// that the underlying data doesn't exist.
//
// Before writing this, the RIE registry was re-checked specifically for
// "Van Inventory" / "Vehicle Stock" / "Van Stock" / "Route Inventory"
// because a prior, incorrect assumption said no vehicle-stock entity
// existed at all. It does: "Van Inventory" is a real Canonical Entity
// (canonical-entities.data.ts, primaryKey ReportDate+RouteID+ProductCode+
// Unit), CONFIDENT-mapped (excel-entity-provider.mapping.ts), has an
// official import template (ReportDate/RouteID/ProductCode/Unit/Quantity/
// BatchNo/ExpiryDate — import-templates.data.ts), and is already read in
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
//                            see — a SALES_REP only ever gets their own).
//   - weeklyAverageSales  <- Invoice Items/Invoices, per the approved
//                            formula (2026-07-28 correction): total sold
//                            Quantity over the last 3 calendar months in
//                            scope, divided by 12 — NOT a rolling 4-week
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

@Injectable()
export class SmartLoadingService {
  constructor(private readonly rieFacade: RieFacade) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  private async tryEntity(ctx: ReturnType<SmartLoadingService["rieContext"]>, entityName: string): Promise<readonly EntityRecord[]> {
    try {
      const result = await this.rieFacade.getEntityRecords(entityName, ctx);
      return result.available ? result.records : [];
    } catch {
      return [];
    }
  }

  async getSession(user: AuthenticatedUser): Promise<SmartLoadingSession> {
    if (!user.companyId) throw new ForbiddenException();
    const ctx = this.rieContext(user);

    const [productsResult, invoicesRecords, invoiceItemsRecords, vanInventoryRecords] = await Promise.all([
      this.rieFacade.getEntityRecords("Products", ctx),
      this.tryEntity(ctx, "Invoices"),
      this.tryEntity(ctx, "Invoice Items"),
      this.rieFacade.getEntityRecords("Van Inventory", ctx),
    ]);

    // Van Inventory unavailable for this company (no upload yet, or the
    // caller's scope has none) — honest degrade, same contract the
    // frontend stub already promised. Never fabricate a stock number.
    if (!vanInventoryRecords.available || vanInventoryRecords.records.length === 0) {
      return { state: "vehicle-stock-unavailable" };
    }

    // ---- Van Inventory -> currentVehicleStock. Latest ReportDate only
    // (a snapshot entity — see canonical-entities.data.ts), same pattern
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
    if (latestReportIso) {
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

    // ---- Invoices -> per-InvoiceNo customer/date lookup (same join shape
    // as sgi.service.ts / team-performance.service.ts).
    const invoiceDateByNo = new Map<string, number>();
    for (const inv of invoicesRecords) {
      const no = String(inv.InvoiceNo ?? "").trim();
      const t = toEpochMs(inv.InvoiceDate);
      if (no && t !== null) invoiceDateByNo.set(no, t);
    }

    // ---- Invoice Items joined to Invoices -> lastSaleDate + weekly
    // average, per ProductCode. lastSaleDate is the max InvoiceDate seen
    // for that product anywhere in the caller's RIE-scoped Invoice Items —
    // "last actual sale of the item within the caller's automatic scope",
    // exactly as specified.
    //
    // weeklyAverageSales (2026-07-28 correction, approved formula):
    // total sold Quantity over the last 3 months / 12 — NOT a rolling
    // 4-week window. 2026-07-28 (second correction): "last 3 months" is a
    // rolling window measured from today's exact date (now minus 3
    // calendar months, same day-of-month), not calendar-month boundaries —
    // e.g. run on the 28th, the window starts on the 28th three months
    // back, not the 1st of that month.
    const now = new Date();
    const threeMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS_LOOKBACK, now.getUTCDate()));
    const nowMs = now.getTime();
    const windowStartMs = threeMonthsAgo.getTime();

    const lastSaleMsByProduct = new Map<string, number>();
    const windowQtyByProduct = new Map<string, number>();

    for (const item of invoiceItemsRecords) {
      const invoiceNo = String(item.InvoiceNo ?? "").trim();
      const t = invoiceDateByNo.get(invoiceNo);
      if (t === undefined) continue;
      const productCode = String(item.ProductCode ?? "").trim();
      if (!productCode) continue;

      const prevLast = lastSaleMsByProduct.get(productCode);
      if (prevLast === undefined || t > prevLast) lastSaleMsByProduct.set(productCode, t);

      if (t >= windowStartMs && t <= nowMs) {
        const qty = toFiniteNumber(item.Quantity) ?? 0;
        windowQtyByProduct.set(productCode, (windowQtyByProduct.get(productCode) ?? 0) + qty);
      }
    }

    // ---- Assemble one row per product the caller actually has vehicle
    // stock data for (Van Inventory is the driving set — a loading list is
    // inherently "what's on/should be on the van", not "every product that
    // ever existed").
    const products: SmartLoadingProduct[] = [];
    const attentionList: { id: string; message: string }[] = [];

    for (const [productCode, currentVehicleStock] of vehicleStockByProduct.entries()) {
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
          message: `${meta?.name ?? productCode} — لم يُباع منذ ${daysSinceLastSale} يومًا رغم وجوده في مخزون السيارة.`,
        });
      }
    }

    products.sort((a, b) => a.productName.localeCompare(b.productName, "ar"));

    return {
      state: "ready",
      products,
      attention: attentionList,
      calculatedAt: new Date(nowMs).toISOString(),
    };
  }
}
