import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  GEO_INTELLIGENCE_LIMITS,
  geoIntelligenceTalkingPointsResultSchema,
  type GeoIntelligenceAnalyzeInput,
  type GeoIntelligenceAnalyzeResult,
  type GeoIntelligenceCompareResult,
  type GeoIntelligenceCompareRieInput,
  type GeoIntelligenceCompareCustomersQueryInput,
  type GeoIntelligenceCustomersQueryInput,
  type GeoIntelligenceCustomersResult,
  type GeoIntelligenceExpansionInput,
  type GeoIntelligenceExpansionResult,
  type GeoIntelligenceScopeField,
  type GeoIntelligenceTalkingPointsInput,
  type GeoIntelligenceTalkingPointsResult,
  type GeoIntelligenceValuesResult,
} from "@field-sales-os/schemas";
import { AppConfigService } from "../../common/config/app-config.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";
import { haversineKm } from "../route-planning/route-balancer.util";

type SheetRow = Record<string, unknown>;

// Same small pure helpers as heatmap.service.ts — duplicated deliberately
// (see that file) rather than factored into a shared util, to keep each
// dashboard feature module self-contained and safe to touch in parallel
// sessions without cross-module coupling.
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isSaneCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

interface CustomerRecord {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

// Migration #5 (ADR-001 / RIE Migration Plan, 2026-07-17) — listCustomers(),
// analyze(), and expansion() below are now RIE-backed (no file/column
// mapping), same as compareCustomerViaRie()/listCustomersViaRie() from
// Migration #1. FilesService is no longer a dependency of this service at
// all — the whole module now reads exclusively through RieFacade.
@Injectable()
export class GeoIntelligenceService {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly rieFacade: RieFacade,
  ) {}

  // Migration #1 (ADR-001) — throws a clear Arabic error when a Canonical
  // Entity RIE needs isn't available yet for this company (no matching
  // dataset uploaded, or the entity has no data-source mapping at all).
  // Mirrors the old "الملف غير موجود" 404 semantics, but for RIE reads.
  private assertEntityAvailable(result: EntityQueryResult, arabicLabel: string): void {
    if (!result.available) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  // Every RIE read in this service must pass requestingUser — omitting it
  // isn't just "unscoped by default", it skips ExcelDatasetEntityProvider's
  // applyHierarchyFilter call entirely (see excel-entity-provider.service.ts),
  // which is exactly the row-level access control (Task #65/#138) legacy
  // FilesService-based reads always enforced. Centralized here so every RIE
  // call site in this file gets it the same way instead of relying on each
  // one to remember.
  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  // Dedupes rows down to one {id, name, lat, lon} per customer — the first
  // row with a sane coordinate for that id wins. Shared by both the
  // customers-search endpoint and analyze()'s resolution step.
  private buildCustomerIndex(
    rows: SheetRow[],
    idColumn: string,
    nameColumn: string | undefined,
    latColumn: string,
    lonColumn: string,
  ): { byId: Map<string, CustomerRecord>; excludedBadCoordinates: number } {
    const byId = new Map<string, CustomerRecord>();
    // Tracked separately from byId so a customer with a mix of good/bad
    // coordinate rows isn't miscounted — this is a per-CUSTOMER exclusion
    // count (only customers that never got a single valid coordinate), not
    // a per-row count like HeatmapService's row-level excludedBadCoordinates.
    const badIds = new Set<string>();
    for (const row of rows) {
      const id = String(row[idColumn] ?? "").trim();
      if (!id) continue;
      const lat = toFiniteNumber(row[latColumn]);
      const lon = toFiniteNumber(row[lonColumn]);
      if (lat === null || lon === null || !isSaneCoordinate(lat, lon)) {
        badIds.add(id);
        continue;
      }
      if (!byId.has(id)) {
        const name = nameColumn ? String(row[nameColumn] ?? id) : id;
        byId.set(id, { id, name, lat, lon });
      }
    }
    let excludedBadCoordinates = 0;
    for (const id of badIds) {
      if (!byId.has(id)) excludedBadCoordinates++;
    }
    return { byId, excludedBadCoordinates };
  }

  // Aggregates SKU-level totals (qty/value/distinct-customer-count) across
  // whatever rows belong to `customerIds` — shared by analyze() (aggregate
  // across the resolved reference set) and compareCustomer() (aggregate
  // across a target customer's own rows, and separately across their
  // neighbors' rows).
  private aggregateProducts(
    rows: SheetRow[],
    customerIds: Set<string>,
    cols: { customerIdColumn: string; skuColumn: string; productNameColumn?: string; categoryColumn?: string; qtyColumn?: string; totalColumn: string },
  ) {
    const productAgg = new Map<
      string,
      { sku: string; name: string; category: string | null; totalQty: number; totalValue: number; customers: Set<string> }
    >();
    for (const row of rows) {
      const id = String(row[cols.customerIdColumn] ?? "").trim();
      if (!id || !customerIds.has(id)) continue;
      const sku = String(row[cols.skuColumn] ?? "").trim();
      if (!sku) continue;
      const total = toFiniteNumber(row[cols.totalColumn]) ?? 0;
      const qty = cols.qtyColumn ? (toFiniteNumber(row[cols.qtyColumn]) ?? 0) : 0;
      const name = cols.productNameColumn ? String(row[cols.productNameColumn] ?? sku) : sku;
      const category = cols.categoryColumn ? String(row[cols.categoryColumn] ?? "") || null : null;

      const existing = productAgg.get(sku);
      if (existing) {
        existing.totalQty += qty;
        existing.totalValue += total;
        existing.customers.add(id);
      } else {
        productAgg.set(sku, { sku, name, category, totalQty: qty, totalValue: total, customers: new Set([id]) });
      }
    }
    return productAgg;
  }

  // Invoice Items joined to Invoices (CustomerCode) with Products metadata
  // (ProductName/Category) layered on — the exact join Migration #1 built
  // for compareCustomerViaRie() below, now extracted so analyze() can reuse
  // it too instead of duplicating the join. Products is optional/degrading:
  // if unavailable, ProductCode itself is used as the label rather than
  // failing the whole request (same spirit as the old join's optional
  // columns).
  private buildJoinedSalesRows(invoicesResult: EntityQueryResult, itemsResult: EntityQueryResult, productsResult: EntityQueryResult): SheetRow[] {
    const invoiceCustomer = new Map<string, string>();
    for (const inv of invoicesResult.records) {
      const no = String(inv.InvoiceNo ?? "").trim();
      const cust = String(inv.CustomerCode ?? "").trim();
      if (no && cust) invoiceCustomer.set(no, cust);
    }

    const productMeta = new Map<string, { name: string; category: string | null }>();
    if (productsResult.available) {
      for (const p of productsResult.records) {
        const code = String(p.ProductCode ?? "").trim();
        if (!code) continue;
        productMeta.set(code, { name: String(p.ProductName ?? code), category: p.Category ? String(p.Category) : null });
      }
    }

    const joinedRows: SheetRow[] = [];
    for (const item of itemsResult.records) {
      const invoiceNo = String(item.InvoiceNo ?? "").trim();
      const customerCode = invoiceCustomer.get(invoiceNo);
      if (!customerCode) continue; // item's invoice not found — dropped, same as the old join's unmatched rows
      const productCode = String(item.ProductCode ?? "").trim();
      const meta = productMeta.get(productCode);
      joinedRows.push({
        CustomerCode: customerCode,
        ProductCode: productCode,
        ProductName: meta?.name ?? productCode,
        Category: meta?.category ?? null,
        Quantity: item.Quantity ?? null,
        LineTotal: item.LineTotal ?? null,
      });
    }
    return joinedRows;
  }

  // Fixed column names for aggregateProducts()/buildCustomerIndex() against
  // RIE-joined rows — Canonical field names now, not admin-picked columns.
  private static readonly RIE_PRODUCT_COLS = {
    customerIdColumn: "CustomerCode",
    skuColumn: "ProductCode",
    productNameColumn: "ProductName",
    categoryColumn: "Category",
    qtyColumn: "Quantity",
    totalColumn: "LineTotal",
  } as const;

  // Migration #5 (ADR-001 / RIE Migration Plan, 2026-07-17) — RIE-backed
  // customer search for this screen's own "search & add customer" step.
  // Same shape/behavior as listCustomersViaRie() below (Migration #1's
  // Comparison-scoped twin) — kept as its own method per this screen's own
  // endpoint rather than merged, so each stays free to diverge later.
  async listCustomers(user: AuthenticatedUser, input: GeoIntelligenceCustomersQueryInput): Promise<GeoIntelligenceCustomersResult> {
    const customersResult = await this.rieFacade.getEntityRecords("Customers", this.rieContext(user));
    this.assertEntityAvailable(customersResult, "Customers");

    const { byId } = this.buildCustomerIndex(customersResult.records as SheetRow[], "CustomerCode", "CustomerName", "Latitude", "Longitude");
    let list = Array.from(byId.values());
    const q = input.search?.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    return { customers: list.sort((a, b) => a.name.localeCompare(b.name)) };
  }

  async analyze(user: AuthenticatedUser, input: GeoIntelligenceAnalyzeInput): Promise<GeoIntelligenceAnalyzeResult> {
    const ctx = this.rieContext(user);
    const [customersResult, invoicesResult, itemsResult, productsResult] = await Promise.all([
      this.rieFacade.getEntityRecords("Customers", ctx),
      this.rieFacade.getEntityRecords("Invoices", ctx),
      this.rieFacade.getEntityRecords("Invoice Items", ctx),
      this.rieFacade.getEntityRecords("Products", ctx),
    ]);
    this.assertEntityAvailable(customersResult, "Customers");
    this.assertEntityAvailable(invoicesResult, "Invoices");
    this.assertEntityAvailable(itemsResult, "Invoice Items");

    const { byId: customerIndex, excludedBadCoordinates } = this.buildCustomerIndex(
      customersResult.records as SheetRow[],
      "CustomerCode",
      "CustomerName",
      "Latitude",
      "Longitude",
    );

    // Resolve the reference customer set.
    const resolved = new Map<string, { record: CustomerRecord; distanceKm: number | null; source: "auto" | "manual" }>();

    if (input.mode === "auto" || input.mode === "both") {
      const ranked = Array.from(customerIndex.values())
        .map((c) => ({ c, d: haversineKm(input.location, c) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, input.nearestCount);
      for (const { c, d } of ranked) resolved.set(c.id, { record: c, distanceKm: d, source: "auto" });
    }

    if (input.mode === "manual" || input.mode === "both") {
      for (const id of input.manualCustomerIds) {
        const c = customerIndex.get(id);
        if (!c) continue;
        const existing = resolved.get(id);
        resolved.set(id, {
          record: c,
          distanceKm: existing?.distanceKm ?? haversineKm(input.location, c),
          source: existing ? existing.source : "manual",
        });
      }
    }

    if (resolved.size === 0) {
      throw new BadRequestException("محدش اتحدد — تأكد من الموقع أو العملاء المختارين");
    }

    // Aggregate product assortment across the resolved set only.
    const joinedRows = this.buildJoinedSalesRows(invoicesResult, itemsResult, productsResult);
    const productAgg = this.aggregateProducts(joinedRows, new Set(resolved.keys()), GeoIntelligenceService.RIE_PRODUCT_COLS);

    const topProducts = Array.from(productAgg.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, input.topProductsLimit)
      .map((p) => ({ sku: p.sku, name: p.name, category: p.category, totalQty: p.totalQty, totalValue: p.totalValue, customerCount: p.customers.size }));

    return {
      resolvedCustomers: Array.from(resolved.values())
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
        .map(({ record, distanceKm, source }) => ({ id: record.id, name: record.name, lat: record.lat, lon: record.lon, distanceKm, source })),
      topProducts,
      excludedBadCoordinates,
      totalRowsConsidered: joinedRows.length,
    };
  }

  // ------------------------------------------------------------------
  // Migration #1 (ADR-001 / RIE Migration Plan) — Customer Comparison.
  // Replaces the old file+column-mapping compareCustomer() above: no
  // fileId, no manually-picked columns. Customers/Invoices/Invoice Items/
  // Products are read straight from RieFacade against the Canonical
  // Schema. Deliberately reuses buildCustomerIndex()/aggregateProducts()
  // unchanged (by column NAME) rather than duplicating the aggregation
  // logic — only the data-loading step changed, per ADR-001's actual
  // point (column identity is RIE's job now, not this service's).
  // ------------------------------------------------------------------

  // RIE-backed replacement for the "search & pick target customer" step,
  // scoped to Customer Comparison's own endpoint.
  async listCustomersViaRie(user: AuthenticatedUser, input: GeoIntelligenceCompareCustomersQueryInput): Promise<GeoIntelligenceCustomersResult> {
    const customersResult = await this.rieFacade.getEntityRecords("Customers", this.rieContext(user));
    this.assertEntityAvailable(customersResult, "Customers");

    const { byId } = this.buildCustomerIndex(customersResult.records as SheetRow[], "CustomerCode", "CustomerName", "Latitude", "Longitude");
    let list = Array.from(byId.values());
    const q = input.search?.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    return { customers: list.sort((a, b) => a.name.localeCompare(b.name)) };
  }

  // "What does customer X's neighbors buy that X doesn't?" — a sales-gap /
  // upsell view for an EXISTING customer. Anchors nearest-neighbor search at
  // the target's own recorded location, then subtracts the target's own SKU
  // set from the neighbors' product aggregation so the result is genuinely
  // "missing", not just "popular nearby".
  //
  // Invoice Items has no CustomerCode of its own (see FSOS Import Templates
  // Specification v1.0 §6.10) — it's joined through Invoices.CustomerCode by
  // InvoiceNo, same relationship Navigation Engine models as REL-CU-002/
  // REL-IN-003. Products supplies ProductName/Category (Invoice Items only
  // carries ProductCode); if Products is unavailable, ProductCode itself is
  // used as the label rather than failing the whole comparison — a real but
  // non-fatal degradation, same spirit as the old join's optional columns.
  async compareCustomerViaRie(user: AuthenticatedUser, input: GeoIntelligenceCompareRieInput): Promise<GeoIntelligenceCompareResult> {
    const ctx = this.rieContext(user);
    const [customersResult, invoicesResult, itemsResult, productsResult] = await Promise.all([
      this.rieFacade.getEntityRecords("Customers", ctx),
      this.rieFacade.getEntityRecords("Invoices", ctx),
      this.rieFacade.getEntityRecords("Invoice Items", ctx),
      this.rieFacade.getEntityRecords("Products", ctx),
    ]);
    this.assertEntityAvailable(customersResult, "Customers");
    this.assertEntityAvailable(invoicesResult, "Invoices");
    this.assertEntityAvailable(itemsResult, "Invoice Items");

    const { byId: customerIndex, excludedBadCoordinates } = this.buildCustomerIndex(
      customersResult.records as SheetRow[],
      "CustomerCode",
      "CustomerName",
      "Latitude",
      "Longitude",
    );

    const target = customerIndex.get(input.targetCustomerId);
    if (!target) {
      throw new BadRequestException("العميل المطلوب مقارنته غير موجود (أو بدون إحداثيات صالحة)");
    }

    const neighborRanked = Array.from(customerIndex.values())
      .filter((c) => c.id !== target.id)
      .map((c) => ({ c, d: haversineKm(target, c) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, input.nearestCount);

    if (neighborRanked.length === 0) {
      throw new BadRequestException("مفيش عملاء تانيين لديهم بيانات كافية للمقارنة بيهم");
    }

    const joinedRows = this.buildJoinedSalesRows(invoicesResult, itemsResult, productsResult);

    const neighborIds = new Set(neighborRanked.map((n) => n.c.id));
    const targetProducts = this.aggregateProducts(joinedRows, new Set([target.id]), GeoIntelligenceService.RIE_PRODUCT_COLS);
    const neighborProducts = this.aggregateProducts(joinedRows, neighborIds, GeoIntelligenceService.RIE_PRODUCT_COLS);

    const gapProducts = Array.from(neighborProducts.values())
      .filter((p) => !targetProducts.has(p.sku))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, input.topProductsLimit)
      .map((p) => ({ sku: p.sku, name: p.name, category: p.category, totalQty: p.totalQty, totalValue: p.totalValue, customerCount: p.customers.size }));

    return {
      targetCustomer: target,
      neighbors: neighborRanked.map(({ c, d }) => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, distanceKm: d, source: "auto" as const })),
      targetProductCount: targetProducts.size,
      gapProducts,
      excludedBadCoordinates,
      totalRowsConsidered: joinedRows.length,
    };
  }

  // New Customer Expansion Map, territory-level upgrade — see the schema
  // comment for the scoring idea. Grid math: at latitude φ, 1 degree of
  // longitude spans cos(φ) times as many km as 1 degree of latitude (111km
  // is the constant either way) — so the longitude cell size in degrees has
  // to widen near the poles / narrow near the equator to stay square in km.
  // Sales value per customer — Invoice Items joined to Invoices by
  // CustomerCode, summed by LineTotal. Same join shape as Migrations #3/#4
  // (REL-CU-002/REL-IN-003 in the Relationship Registry).
  private async computeSalesByCustomer(ctx: ReturnType<GeoIntelligenceService["rieContext"]>): Promise<Map<string, number>> {
    const [invoicesResult, itemsResult] = await Promise.all([
      this.rieFacade.getEntityRecords("Invoices", ctx),
      this.rieFacade.getEntityRecords("Invoice Items", ctx),
    ]);
    this.assertEntityAvailable(invoicesResult, "الفواتير");
    this.assertEntityAvailable(itemsResult, "أصناف الفاتورة");

    const invoiceCustomer = new Map<string, string>();
    for (const inv of invoicesResult.records) {
      const no = String(inv.InvoiceNo ?? "").trim();
      const cust = String(inv.CustomerCode ?? "").trim();
      if (no && cust) invoiceCustomer.set(no, cust);
    }

    const salesById = new Map<string, number>();
    for (const item of itemsResult.records) {
      const invoiceNo = String(item.InvoiceNo ?? "").trim();
      const customerCode = invoiceCustomer.get(invoiceNo);
      if (!customerCode) continue;
      const amount = toFiniteNumber(item.LineTotal) ?? 0;
      salesById.set(customerCode, (salesById.get(customerCode) ?? 0) + amount);
    }
    return salesById;
  }

  async expansion(user: AuthenticatedUser, input: GeoIntelligenceExpansionInput): Promise<GeoIntelligenceExpansionResult> {
    const ctx = this.rieContext(user);
    const customersResult = await this.rieFacade.getEntityRecords("Customers", ctx);
    this.assertEntityAvailable(customersResult, "العملاء");

    let scoped = customersResult.records;
    if (input.scopeField && input.scopeValues && input.scopeValues.length > 0) {
      const scopeSet = new Set(input.scopeValues);
      scoped = scoped.filter((row) => scopeSet.has(String(row[input.scopeField!] ?? "")));
      if (scoped.length === 0) {
        throw new BadRequestException(`لا توجد بيانات مطابقة لـ ${input.scopeField} ضمن [${input.scopeValues.join(", ")}]`);
      }
    }

    const salesById = await this.computeSalesByCustomer(ctx);

    // Aggregate per-customer: total value (RIE sales aggregate) + one sane
    // coordinate.
    const valueById = new Map<string, number>();
    const coordById = new Map<string, { lat: number; lon: number }>();
    for (const row of scoped) {
      const id = String(row.CustomerCode ?? "").trim();
      if (!id) continue;
      valueById.set(id, salesById.get(id) ?? 0);
      if (!coordById.has(id)) {
        const lat = toFiniteNumber(row.Latitude);
        const lon = toFiniteNumber(row.Longitude);
        if (lat !== null && lon !== null && isSaneCoordinate(lat, lon)) coordById.set(id, { lat, lon });
      }
    }

    const customers = Array.from(coordById.entries()).map(([id, c]) => ({ id, lat: c.lat, lon: c.lon, value: valueById.get(id) ?? 0 }));
    if (customers.length < 3) {
      throw new BadRequestException("محتاج على الأقل 3 عملاء بإحداثيات صالحة لتحليل التوسع");
    }

    const lats = customers.map((c) => c.lat);
    const lons = customers.map((c) => c.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const KM_PER_DEG_LAT = 111;
    const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
    const kmPerDegLon = Math.max(1, KM_PER_DEG_LAT * Math.cos(midLatRad));
    const latStep = input.gridSizeKm / KM_PER_DEG_LAT;
    const lonStep = input.gridSizeKm / kmPerDegLon;

    const rows_ = Math.max(1, Math.ceil((maxLat - minLat) / latStep) + 1);
    const cols_ = Math.max(1, Math.ceil((maxLon - minLon) / lonStep) + 1);
    // Computation-time guard — a very small gridSizeKm over a wide bounding
    // box could otherwise blow up into millions of cells.
    if (rows_ * cols_ > 200_000) {
      throw new BadRequestException("حجم الشبكة كبير جدًا لهذا النطاق — كبّر حجم الخلية (كم) أو ضيّق النطاق");
    }

    function cellOf(lat: number, lon: number): { r: number; c: number } {
      return { r: Math.floor((lat - minLat) / latStep), c: Math.floor((lon - minLon) / lonStep) };
    }

    const cellCustomerCount = new Map<string, number>();
    const cellValue = new Map<string, number>();
    const key = (r: number, c: number) => `${r}:${c}`;

    for (const cust of customers) {
      const { r, c } = cellOf(cust.lat, cust.lon);
      const k = key(r, c);
      cellCustomerCount.set(k, (cellCustomerCount.get(k) ?? 0) + 1);
      cellValue.set(k, (cellValue.get(k) ?? 0) + cust.value);
    }

    // Score every empty cell within the bounding box's grid by summing its
    // occupied Moore-neighborhood (8 surrounding cells) value, weighted
    // more toward closer neighbors is unnecessary at this cell granularity
    // — immediate adjacency is already the signal.
    const points: GeoIntelligenceExpansionResult["points"] = [];
    let maxScore = 0;
    for (let r = 0; r < rows_; r++) {
      for (let c = 0; c < cols_; c++) {
        const selfKey = key(r, c);
        if (cellCustomerCount.has(selfKey)) continue; // occupied cells aren't expansion targets
        let score = 0;
        let neighborCustomers = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nk = key(r + dr, c + dc);
            const nCount = cellCustomerCount.get(nk);
            if (nCount) {
              score += cellValue.get(nk) ?? 0;
              neighborCustomers += nCount;
            }
          }
        }
        if (neighborCustomers === 0) continue; // isolated empty cell, not adjacent to any served area
        maxScore = Math.max(maxScore, score);
        const centerLat = minLat + (r + 0.5) * latStep;
        const centerLon = minLon + (c + 0.5) * lonStep;
        points.push({ id: selfKey, label: "منطقة غير مخدومة", lat: centerLat, lon: centerLon, value: score });
      }
    }

    points.sort((a, b) => b.value - a.value);
    const topPoints = points.slice(0, 500);

    return {
      customerCount: customers.length,
      gridSizeKm: input.gridSizeKm,
      totalCells: rows_ * cols_,
      emptyCellsScored: points.length,
      maxScore,
      points: topPoints,
    };
  }

  // RIE-backed dedicated dropdown endpoint for the Territory Expansion
  // scope field — same pattern as Migrations #3/#4's scope-values
  // endpoints. Does NOT touch GET /route-planning/distinct-values, which
  // this screen used before its own migration turn.
  async expansionScopeValues(user: AuthenticatedUser, scopeField: GeoIntelligenceScopeField): Promise<GeoIntelligenceValuesResult> {
    const customersResult = await this.rieFacade.getEntityRecords("Customers", this.rieContext(user));
    this.assertEntityAvailable(customersResult, "العملاء");
    const values = new Set<string>();
    for (const row of customersResult.records) {
      const v = String(row[scopeField] ?? "").trim();
      if (v) values.add(v);
    }
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }

  // Optional AI layer on top of analyze()'s output — same Claude-API call
  // pattern as HeatmapService.interpret(), but generation instead of filter
  // interpretation.
  async talkingPoints(_companyId: string, input: GeoIntelligenceTalkingPointsInput): Promise<GeoIntelligenceTalkingPointsResult> {
    const apiKey = this.appConfig.values.anthropic.apiKey;
    if (!apiKey) {
      throw new BadRequestException("ميزة نقاط الحديث بالذكاء الاصطناعي تحتاج ANTHROPIC_API_KEY مضبوط على السيرفر.");
    }
    if (input.topProducts.length === 0) {
      throw new BadRequestException("مفيش أصناف كفاية لتوليد نقاط حديث — نفّذ التحليل الأول");
    }

    const productLines = input.topProducts
      .slice(0, GEO_INTELLIGENCE_LIMITS.maxTopProductsInPrompt)
      .map((p, i) => `${i + 1}. ${p.name} (${p.category ?? "بدون تصنيف"}) — إجمالي مبيعات ${p.totalValue.toFixed(0)}, عدد عملاء ${p.customerCount}`)
      .join("\n");

    const systemPrompt =
      input.framing === "gap"
        ? [
            "أنت مساعد مندوب مبيعات ميداني في شركة FMCG. المندوب واقف عند عميل حالي (عنده تاريخ شراء بالفعل) وعايز يعمل Upsell.",
            "معاك قائمة أصناف بيشتريها عملاء تانيين قريبين جغرافيًا من نفس العميل، لكن العميل ده نفسه لسه ما جربهاش خالص، وعايز:",
            "1) ملخص قصير (سطرين بالعربي) عن الفرصة البيعية الموجودة عند العميل ده.",
            "2) قائمة نقاط حديث عملية (3 إلى 6 نقاط) المندوب يقدر يستخدمها فعليًا وهو بيقنع العميل يجرب الأصناف دي — كل نقطة جملة أو جملتين، عملية ومباشرة، تعتمد على أرقام حقيقية (زي عدد العملاء القريبين اللي بيشتروها) مش كلام عام.",
            'أرجع JSON فقط بدون أي نص إضافي وبدون markdown، بالشكل: {"summary": string, "talkingPoints": string[]}',
          ].join("\n")
        : [
            "أنت مساعد مندوب مبيعات ميداني في شركة FMCG. المندوب واقف عند عميل جديد لسه هيزوره لأول مرة.",
            "معاك تشكيلة الأصناف الأعلى أداءً عند أقرب/أشبه العملاء الموجودين فعلاً في نفس المنطقة، وعايز:",
            "1) ملخص قصير (سطرين بالعربي) عن المنطقة وأداء الأصناف فيها.",
            "2) قائمة نقاط حديث عملية (3 إلى 6 نقاط) المندوب يقدر يستخدمها فعليًا وهو بيتكلم مع العميل الجديد — كل نقطة جملة أو جملتين، عملية ومباشرة، تعتمد على أرقام حقيقية من البيانات مش كلام عام.",
            'أرجع JSON فقط بدون أي نص إضافي وبدون markdown، بالشكل: {"summary": string, "talkingPoints": string[]}',
          ].join("\n");

    const userMessageParts = [
      input.areaLabel ? `المنطقة: ${input.areaLabel}` : "المنطقة: غير محددة",
      `عدد العملاء المرجعيين المستخدمين في التحليل: ${input.customerCount}`,
      `الأصناف الأعلى أداءً:\n${productLines}`,
    ];

    let response: globalThis.Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 700,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessageParts.join("\n") }],
        }),
      });
    } catch {
      throw new BadRequestException("تعذر الاتصال بخدمة الذكاء الاصطناعي، حاول تاني.");
    }

    if (!response.ok) {
      throw new BadRequestException(`فشل طلب توليد نقاط الحديث (${response.status}).`);
    }

    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).find((block) => block.type === "text")?.text ?? "";

    let parsed: unknown;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? text);
    } catch {
      throw new BadRequestException("معرفتش أولّد نقاط حديث، جرب تاني.");
    }

    const result = geoIntelligenceTalkingPointsResultSchema.safeParse(parsed);
    if (!result.success) {
      throw new BadRequestException("رد غير متوقع من خدمة الذكاء الاصطناعي، جرب تاني.");
    }
    return result.data;
  }
}
