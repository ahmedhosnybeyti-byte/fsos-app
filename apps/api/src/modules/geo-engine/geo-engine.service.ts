import { Injectable, NotFoundException } from "@nestjs/common";
import type { DecisionInsightItem, GeoFilters, GeoGroupBy, GeoKpi, GeoPoint, GeoQueryInput, GeoQueryResult, GeoTableQueryInput, GeoTableResult, GeoTableRow, SgiSituation } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { SgiService } from "../sgi/sgi.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";

// Geo Intelligence Engine — Phase 1 backend (Executive Map Redesign Spec,
// 2026-07-22, client-approved). See geo-engine.schemas.ts for the full
// design rationale (module naming, why Country/Region/boundary-polygons are
// deliberately out of scope here, unified-filter-shape parity with Decision
// Analytics Studio).
//
// Self-contained per this codebase's established per-module isolation
// convention: reads Customers/Invoices/Invoice Items/Products/Routes/
// Employees/Collections/Visits independently via RieFacade rather than
// importing decision-analytics-studio.service.ts's private loadContext(),
// duplicating the small helpers it needs (same choice heatmap.service.ts /
// decision-analytics-studio.service.ts / territory-intelligence.service.ts
// each already made, documented in their own file headers).

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

// Same guard as Route Planning / heatmap.service.ts — garbage 0,0 rows.
function isSaneCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9؀-ۿ-]/g, "");
}

interface CustomerMeta {
  code: string;
  name: string;
  city: string;
  channel: string;
  branchId: string;
  routeId: string;
  lat: number | null;
  lon: number | null;
}

interface ProductMeta {
  name: string;
  category: string;
  brand: string;
}

interface ResolvedRep {
  repEmail: string;
  repName: string;
  supervisorEmail: string | null;
  supervisorName: string | null;
}

interface SalesRow {
  invoiceNo: string;
  lineNo: number;
  time: number | null;
  customerCode: string;
  productCode: string;
  amount: number;
}

@Injectable()
export class GeoEngineService {
  constructor(
    private readonly rieFacade: RieFacade,
    private readonly sgiService: SgiService,
  ) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  private assertAvailable(result: EntityQueryResult, arabicLabel: string): void {
    if (!result.available) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  // Routes.SalesRepID -> Employees, then Employees.DirectManagerID ->
  // Employees for the supervisor half — same two-hop join as
  // team-performance.service.ts / decision-analytics-studio.service.ts's
  // buildRepResolver, duplicated per this codebase's established
  // per-module-isolation convention.
  private buildRepResolver(routesResult: EntityQueryResult, employeesResult: EntityQueryResult): (routeId: string) => ResolvedRep | null {
    const routeSalesRep = new Map<string, string>();
    for (const route of routesResult.records) {
      const routeId = String(route.RouteID ?? "").trim();
      const salesRepId = String(route.SalesRepID ?? "").trim();
      if (routeId && salesRepId) routeSalesRep.set(routeId, salesRepId);
    }

    const employeeById = new Map<string, { name: string; email: string; managerId: string | null }>();
    if (employeesResult.available) {
      for (const emp of employeesResult.records) {
        const id = String(emp.EmployeeID ?? "").trim();
        if (!id) continue;
        const managerId = String(emp.DirectManagerID ?? "").trim();
        employeeById.set(id, { name: String(emp.EmployeeName ?? id), email: String(emp.Email ?? "").trim() || id, managerId: managerId || null });
      }
    }

    return (routeId: string): ResolvedRep | null => {
      const trimmedRouteId = routeId.trim();
      if (!trimmedRouteId) return null;
      const salesRepId = routeSalesRep.get(trimmedRouteId);
      if (!salesRepId) return { repEmail: trimmedRouteId, repName: trimmedRouteId, supervisorEmail: null, supervisorName: null };
      const emp = employeeById.get(salesRepId);
      if (!emp) return { repEmail: salesRepId, repName: salesRepId, supervisorEmail: null, supervisorName: null };
      const manager = emp.managerId ? employeeById.get(emp.managerId) : undefined;
      return {
        repEmail: emp.email,
        repName: emp.name,
        supervisorEmail: manager ? manager.email : null,
        supervisorName: manager ? manager.name : null,
      };
    };
  }

  private async loadContext(user: AuthenticatedUser) {
    const ctx = this.rieContext(user);
    const [customersResult, productsResult, invoicesResult, invoiceItemsResult, routesResult, employeesResult, collectionsResult, returnsResult, visitsResult] =
      await Promise.all([
        this.rieFacade.getEntityRecords("Customers", ctx),
        this.rieFacade.getEntityRecords("Products", ctx),
        this.rieFacade.getEntityRecords("Invoices", ctx),
        this.rieFacade.getEntityRecords("Invoice Items", ctx),
        this.rieFacade.getEntityRecords("Routes", ctx),
        this.rieFacade.getEntityRecords("Employees", ctx),
        this.rieFacade.getEntityRecords("Collections", ctx),
        this.rieFacade.getEntityRecords("Returns", ctx),
        this.rieFacade.getEntityRecords("Visits", ctx),
      ]);
    this.assertAvailable(customersResult, "العملاء");

    const customerMeta = new Map<string, CustomerMeta>();
    for (const c of customersResult.records) {
      const code = String(c.CustomerCode ?? "").trim();
      if (!code) continue;
      customerMeta.set(code, {
        code,
        name: String(c.CustomerName ?? code),
        city: String(c.City ?? "").trim(),
        channel: String(c.Channel ?? "").trim(),
        branchId: String(c.BranchID ?? "").trim(),
        routeId: String(c.RouteID ?? "").trim(),
        lat: toFiniteNumber(c.Latitude),
        lon: toFiniteNumber(c.Longitude),
      });
    }

    const productMeta = new Map<string, ProductMeta>();
    if (productsResult.available) {
      for (const p of productsResult.records) {
        const code = String(p.ProductCode ?? "").trim();
        if (code) productMeta.set(code, { name: String(p.ProductName ?? code), category: String(p.Category ?? "").trim(), brand: String(p.Brand ?? "").trim() });
      }
    }

    const resolveRep = this.buildRepResolver(routesResult, employeesResult);

    // No InvoiceStatus filter — matches heatmap.service.ts / team-
    // performance.service.ts's existing join (see decision-analytics-studio
    // .service.ts's loadContext() comment: an earlier module invented this
    // filter and it silently zeroed sales data; not repeating that mistake).
    const invoicesAvailable = invoicesResult.available && invoiceItemsResult.available;
    const salesRows: SalesRow[] = [];
    if (invoicesAvailable) {
      const invoiceMeta = new Map<string, { customerCode: string; time: number | null }>();
      for (const inv of invoicesResult.records) {
        const no = String(inv.InvoiceNo ?? "").trim();
        const cust = String(inv.CustomerCode ?? "").trim();
        if (no && cust) invoiceMeta.set(no, { customerCode: cust, time: toEpochMs(inv.InvoiceDate) });
      }
      for (const item of invoiceItemsResult.records) {
        const invoiceNo = String(item.InvoiceNo ?? "").trim();
        const meta = invoiceMeta.get(invoiceNo);
        if (!meta) continue;
        salesRows.push({
          invoiceNo,
          lineNo: toFiniteNumber(item.LineNo) ?? 0,
          time: meta.time,
          customerCode: meta.customerCode,
          productCode: String(item.ProductCode ?? "").trim(),
          amount: toFiniteNumber(item.LineTotal) ?? 0,
        });
      }
    }

    return { customerMeta, productMeta, resolveRep, salesRows, invoicesAvailable, collectionsResult, returnsResult, visitsResult };
  }

  // Every filter array on GeoFilters, compiled once into Sets (or null = "no
  // restriction on this axis") — same shape as decision-analytics-studio
  // .service.ts's compileFilters.
  private compileFilters(filters: GeoFilters) {
    return {
      city: filters.cityValues?.length ? new Set(filters.cityValues) : null,
      channel: filters.channelValues?.length ? new Set(filters.channelValues) : null,
      branch: filters.branchIds?.length ? new Set(filters.branchIds) : null,
      customer: filters.customerCodes?.length ? new Set(filters.customerCodes) : null,
      category: filters.categoryValues?.length ? new Set(filters.categoryValues) : null,
      brand: filters.brandValues?.length ? new Set(filters.brandValues) : null,
      product: filters.productCodes?.length ? new Set(filters.productCodes) : null,
      rep: filters.repEmails?.length ? new Set(filters.repEmails) : null,
      supervisor: filters.supervisorEmails?.length ? new Set(filters.supervisorEmails) : null,
    };
  }

  private customerInScope(
    meta: CustomerMeta,
    compiled: ReturnType<GeoEngineService["compileFilters"]>,
    resolveRep: (routeId: string) => ResolvedRep | null,
  ): boolean {
    if (compiled.city && !compiled.city.has(meta.city)) return false;
    if (compiled.channel && !compiled.channel.has(meta.channel)) return false;
    if (compiled.branch && !compiled.branch.has(meta.branchId)) return false;
    if (compiled.customer && !compiled.customer.has(meta.code)) return false;
    if (compiled.rep || compiled.supervisor) {
      const rep = resolveRep(meta.routeId);
      if (compiled.rep && (!rep || !compiled.rep.has(rep.repEmail))) return false;
      if (compiled.supervisor && (!rep || !rep.supervisorEmail || !compiled.supervisor.has(rep.supervisorEmail))) return false;
    }
    return true;
  }

  // category/brand/product filters only apply to sales-derived rows (sales/
  // orders/lostSales) — no SKU dimension exists for collections/visits/
  // customers here, same documented limitation as heatmap.schemas.ts's
  // categoryValue comment ("meaningless for returns/collection/
  // customerCount — no SKU dimension under RIE").
  private salesRowInScope(row: SalesRow, compiled: ReturnType<GeoEngineService["compileFilters"]>, productMeta: Map<string, ProductMeta>): boolean {
    if (!compiled.category && !compiled.brand && !compiled.product) return true;
    if (compiled.product && !compiled.product.has(row.productCode)) return false;
    if (compiled.category || compiled.brand) {
      const p = productMeta.get(row.productCode);
      if (compiled.category && (!p || !compiled.category.has(p.category))) return false;
      if (compiled.brand && (!p || !compiled.brand.has(p.brand))) return false;
    }
    return true;
  }

  private windowFor(input: GeoFilters): { fromTime: number; toTime: number; priorFromTime: number; priorToTime: number } {
    const fromTime = Date.parse(input.dateFrom);
    const toTime = Date.parse(input.dateTo);
    if (input.priorDateFrom && input.priorDateTo) {
      return { fromTime, toTime, priorFromTime: Date.parse(input.priorDateFrom), priorToTime: Date.parse(input.priorDateTo) };
    }
    // Auto-derive a same-length immediately-preceding window — same
    // convention as decision-analytics-studio.service.ts.
    const spanMs = Math.max(toTime - fromTime, 0);
    return { fromTime, toTime, priorFromTime: fromTime - spanMs - 1, priorToTime: fromTime - 1 };
  }

  async query(user: AuthenticatedUser, input: GeoQueryInput): Promise<GeoQueryResult> {
    const ctx = await this.loadContext(user);
    const compiled = this.compileFilters(input);
    const { fromTime, toTime, priorFromTime, priorToTime } = this.windowFor(input);

    const inScopeCustomers = new Map<string, CustomerMeta>();
    for (const [code, meta] of ctx.customerMeta) {
      if (this.customerInScope(meta, compiled, ctx.resolveRep)) inScopeCustomers.set(code, meta);
    }

    const valueByCustomer = new Map<string, number>();

    if (input.kpi === "sales" || input.kpi === "orders") {
      if (!ctx.invoicesAvailable) throw new NotFoundException('بيانات "الفواتير" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.');
      const orderNosByCustomer = new Map<string, Set<string>>();
      for (const row of ctx.salesRows) {
        if (!inScopeCustomers.has(row.customerCode)) continue;
        if (row.time === null || row.time < fromTime || row.time > toTime) continue;
        if (!this.salesRowInScope(row, compiled, ctx.productMeta)) continue;
        if (input.kpi === "sales") {
          valueByCustomer.set(row.customerCode, (valueByCustomer.get(row.customerCode) ?? 0) + row.amount);
        } else {
          const set = orderNosByCustomer.get(row.customerCode) ?? new Set<string>();
          set.add(row.invoiceNo);
          orderNosByCustomer.set(row.customerCode, set);
        }
      }
      if (input.kpi === "orders") {
        for (const [code, set] of orderNosByCustomer) valueByCustomer.set(code, set.size);
      }
    } else if (input.kpi === "lostSales") {
      if (!ctx.invoicesAvailable) throw new NotFoundException('بيانات "الفواتير" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.');
      const priorSkuValue = new Map<string, Map<string, number>>();
      const recentSkus = new Map<string, Set<string>>();
      for (const row of ctx.salesRows) {
        if (!inScopeCustomers.has(row.customerCode) || row.time === null) continue;
        if (!this.salesRowInScope(row, compiled, ctx.productMeta)) continue;
        if (row.time >= priorFromTime && row.time <= priorToTime) {
          const bySku = priorSkuValue.get(row.customerCode) ?? new Map<string, number>();
          bySku.set(row.productCode, (bySku.get(row.productCode) ?? 0) + row.amount);
          priorSkuValue.set(row.customerCode, bySku);
        }
        if (row.time >= fromTime && row.time <= toTime) {
          const skus = recentSkus.get(row.customerCode) ?? new Set<string>();
          skus.add(row.productCode);
          recentSkus.set(row.customerCode, skus);
        }
      }
      for (const [code, bySku] of priorSkuValue) {
        const recent = recentSkus.get(code);
        let lost = 0;
        for (const [sku, val] of bySku) if (!recent?.has(sku)) lost += val;
        if (lost > 0) valueByCustomer.set(code, lost);
      }
    } else if (input.kpi === "collections") {
      this.assertAvailable(ctx.collectionsResult, "التحصيل");
      for (const row of ctx.collectionsResult.records) {
        const code = String(row.CustomerCode ?? "").trim();
        if (!inScopeCustomers.has(code)) continue;
        const t = toEpochMs(row.CollectionDate);
        if (t === null || t < fromTime || t > toTime) continue;
        valueByCustomer.set(code, (valueByCustomer.get(code) ?? 0) + (toFiniteNumber(row.Amount) ?? 0));
      }
    } else if (input.kpi === "returns") {
      this.assertAvailable(ctx.returnsResult, "المرتجعات");
      for (const row of ctx.returnsResult.records) {
        const code = String(row.CustomerCode ?? "").trim();
        if (!inScopeCustomers.has(code)) continue;
        const t = toEpochMs(row.ReturnDate);
        if (t === null || t < fromTime || t > toTime) continue;
        valueByCustomer.set(code, (valueByCustomer.get(code) ?? 0) + (toFiniteNumber(row.TotalAmount) ?? 0));
      }
    } else if (input.kpi === "visits") {
      this.assertAvailable(ctx.visitsResult, "الزيارات");
      for (const row of ctx.visitsResult.records) {
        const code = String(row.CustomerCode ?? "").trim();
        if (!inScopeCustomers.has(code)) continue;
        const t = toEpochMs(row.VisitDate);
        if (t === null || t < fromTime || t > toTime) continue;
        valueByCustomer.set(code, (valueByCustomer.get(code) ?? 0) + 1);
      }
    }
    // "customers" kpi: valueByCustomer stays empty — every in-scope customer
    // with valid coordinates gets value=1 below (a density/presence map, same
    // convention as heatmap.service.ts's "customerCount" metric).

    const customerPoints: GeoPoint[] = [];
    let excludedBadCoordinates = 0;
    for (const [code, meta] of inScopeCustomers) {
      if (meta.lat === null || meta.lon === null || !isSaneCoordinate(meta.lat, meta.lon)) {
        excludedBadCoordinates++;
        continue;
      }
      const value = input.kpi === "customers" ? 1 : (valueByCustomer.get(code) ?? 0);
      customerPoints.push({ id: code, name: meta.name, lat: meta.lat, lon: meta.lon, city: meta.city, value });
    }

    const points = input.groupBy === "city" ? this.groupByCity(customerPoints) : customerPoints;

    // ---- AI Insight panel (Phase 3): reused from SGI's already-persisted
    // situations, scoped down to whichever customers/reps are in the CURRENT
    // GeoFilters — same block, same reasoning, as decision-analytics-studio
    // .service.ts's query() (3rd/4th independent instance of this exact
    // reuse convention, see that file's own comment). No live LLM call. ----
    const insights = await this.computeInsights(user, inScopeCustomers, compiled, ctx.resolveRep);

    return {
      kpi: input.kpi,
      groupBy: input.groupBy,
      points,
      maxValue: points.reduce((m, p) => Math.max(m, p.value), 0),
      totalValue: points.reduce((s, p) => s + p.value, 0),
      totalRows: inScopeCustomers.size,
      excludedBadCoordinates,
      insights,
      datasetsAvailable: {
        invoices: ctx.invoicesAvailable,
        collections: ctx.collectionsResult.available,
        returns: ctx.returnsResult.available,
        visits: ctx.visitsResult.available,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  // Same filter/scope/sort/map logic as decision-analytics-studio.service.ts
  // query()'s SGI block, extracted here since geo-engine.service.ts needs it
  // from both query() and (not yet, but plausibly later) other entry points.
  // Duplicated rather than imported per this codebase's established
  // per-module isolation convention.
  private async computeInsights(
    user: AuthenticatedUser,
    inScopeCustomers: Map<string, CustomerMeta>,
    compiled: ReturnType<GeoEngineService["compileFilters"]>,
    resolveRep: (routeId: string) => ResolvedRep | null,
  ): Promise<DecisionInsightItem[]> {
    const sgiData = await this.sgiService.getLatest(user);
    if (!sgiData) return [];

    const repSupervisorFromSgi = new Map<string, string | null>();
    for (const d of sgiData.repDirectory) repSupervisorFromSgi.set(d.email, d.supervisorEmail);

    const anyNonPeopleFilterActive = Boolean(compiled.city || compiled.channel || compiled.branch || compiled.category || compiled.brand || compiled.product || compiled.customer);

    const inScopeSituations: SgiSituation[] = [];
    for (const s of sgiData.situations) {
      let inScope: boolean;
      if (s.entityType === "customer") {
        inScope = inScopeCustomers.has(s.entityKey.trim());
      } else {
        const repEmail = s.entityKey.trim();
        inScope = !anyNonPeopleFilterActive; // rep-type situations have no customer/product link to verify against those filters
        if (inScope && compiled.rep) inScope = compiled.rep.has(repEmail);
        if (inScope && compiled.supervisor) {
          const sup = repSupervisorFromSgi.get(repEmail) ?? null;
          inScope = Boolean(sup && compiled.supervisor.has(sup));
        }
      }
      if (inScope) inScopeSituations.push(s);
    }

    const severityRank: Record<SgiSituation["severity"], number> = { high: 0, medium: 1, low: 2 };
    return [...inScopeSituations]
      .sort((a, b) => {
        const sevDiff = severityRank[a.severity] - severityRank[b.severity];
        if (sevDiff !== 0) return sevDiff;
        return Math.abs(b.metricValue - (b.metricValuePrior ?? 0)) - Math.abs(a.metricValue - (a.metricValuePrior ?? 0));
      })
      .slice(0, 8)
      .map((s) => ({ type: s.type, severity: s.severity, label: s.title, detail: s.detail }));
  }

  // Detail Table (Phase 3) — Invoice-line grain, the "Invoice" step of the
  // client's City -> Territory -> Customer -> Invoice drill chain (see
  // geo-engine.schemas.ts's geoTableQueryInputSchema comment for why this
  // isn't a separate click level: same convention decision-analytics-studio
  // .service.ts's table() already established for its own identical chain).
  // Logic mirrors that method field-for-field (GeoFilters is field-identical
  // to DecisionFilters) but reads through this module's OWN loadContext(),
  // per this codebase's established per-module isolation convention.
  async table(user: AuthenticatedUser, input: GeoTableQueryInput): Promise<GeoTableResult> {
    const { fromTime, toTime } = this.windowFor(input);
    const ctx = await this.loadContext(user);
    const compiled = this.compileFilters(input);

    const inScopeCustomers = new Map<string, CustomerMeta>();
    for (const [code, meta] of ctx.customerMeta) {
      if (this.customerInScope(meta, compiled, ctx.resolveRep)) inScopeCustomers.set(code, meta);
    }

    const matching = ctx.salesRows.filter(
      (r) => r.time !== null && r.time >= fromTime && r.time <= toTime && inScopeCustomers.has(r.customerCode) && this.salesRowInScope(r, compiled, ctx.productMeta),
    );
    matching.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));

    const totalRows = matching.length;
    const start = (input.page - 1) * input.pageSize;
    const page = matching.slice(start, start + input.pageSize);

    const rows: GeoTableRow[] = page.map((r) => {
      const c = ctx.customerMeta.get(r.customerCode);
      const p = ctx.productMeta.get(r.productCode);
      const rep = c ? ctx.resolveRep(c.routeId) : null;
      return {
        invoiceNo: r.invoiceNo,
        lineNo: r.lineNo,
        date: r.time !== null ? new Date(r.time).toISOString() : null,
        customerCode: r.customerCode,
        customerName: c?.name ?? r.customerCode,
        city: c?.city ?? "",
        channel: c?.channel ?? "",
        productCode: r.productCode,
        productName: p?.name ?? r.productCode,
        category: p?.category ?? "",
        brand: p?.brand ?? "",
        repName: rep?.repName ?? "",
        supervisorName: rep?.supervisorName ?? "",
        amount: r.amount,
      };
    });

    return { rows, page: input.page, pageSize: input.pageSize, totalRows };
  }

  // City centroid (mean of member points' lat/lon, same convention as
  // territory-intelligence.service.ts) + summed value. "customers" kpi's
  // per-point value=1 sums correctly into a real per-city customer count.
  private groupByCity(points: GeoPoint[]): GeoPoint[] {
    interface Acc {
      name: string;
      latSum: number;
      lonSum: number;
      count: number;
      value: number;
    }
    const byCity = new Map<string, Acc>();
    for (const p of points) {
      const city = p.city || p.name;
      const id = slugify(city);
      const acc = byCity.get(id) ?? { name: city, latSum: 0, lonSum: 0, count: 0, value: 0 };
      acc.latSum += p.lat;
      acc.lonSum += p.lon;
      acc.count += 1;
      acc.value += p.value;
      byCity.set(id, acc);
    }
    return Array.from(byCity.entries()).map(([id, acc]) => ({
      id,
      name: acc.name,
      lat: acc.latSum / acc.count,
      lon: acc.lonSum / acc.count,
      city: acc.name,
      value: acc.value,
    }));
  }
}
