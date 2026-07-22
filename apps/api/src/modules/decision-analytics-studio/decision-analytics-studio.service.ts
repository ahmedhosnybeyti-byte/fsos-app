import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  DecisionAnalyzeByDimension,
  DecisionChartGroup,
  DecisionFilterField,
  DecisionFilterOptionsResult,
  DecisionFilters,
  DecisionHeatmapTerritory,
  DecisionInsightItem,
  DecisionKpiSummary,
  DecisionQueryInput,
  DecisionQueryResult,
  DecisionTableQueryInput,
  DecisionTableResult,
  DecisionTableRow,
  SgiSituation,
} from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { SgiService } from "../sgi/sgi.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";

// Decision Analytics Studio — purpose-built minimum backend for this one
// screen (2026-07-22 product decision: frontend was built first against
// existing endpoints; this module implements exactly the capabilities that
// audit found missing — flexible multi-dimension group-by, Orders/Average
// Order/Active Customers-as-a-count/Strike Rate/Productivity, and an
// Invoice-line-level detail table — nothing more). No existing service
// (Heat Map, Team Performance, Territory Intelligence, SGI) is modified;
// this module reads the same Canonical Entities via RieFacade independently
// and duplicates the handful of small helpers it needs (toFiniteNumber,
// toEpochMs, the rep resolver), matching this codebase's established
// per-module isolation convention (see heatmap.service.ts / team-
// performance.service.ts's own comments on the same choice).

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

// Same sanity check Geo Engine's own customer-point builder uses (rejects
// out-of-range values and literal (0,0) "Null Island") — duplicated here per
// this module's established per-module isolation convention.
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

interface GroupAcc {
  label: string;
  sales: number;
  salesPrior: number;
  orderNos: Set<string>;
  customerCodes: Set<string>;
}

@Injectable()
export class DecisionAnalyticsStudioService {
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
  // team-performance.service.ts's buildRepResolver, duplicated per this
  // codebase's established per-module isolation convention rather than
  // imported (team-performance.service.ts is explicitly not to be touched).
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

  // Loads + resolves everything this module's three endpoints share:
  // Customer/Product metadata, the rep resolver, and the raw joined sales
  // rows (Invoice Items -> Invoices, same unfiltered join heatmap.service.ts
  // uses). Each caller applies its own window/filters on top of this shared
  // shape.
  private async loadContext(user: AuthenticatedUser) {
    const ctx = this.rieContext(user);
    const [
      customersResult,
      productsResult,
      invoicesResult,
      invoiceItemsResult,
      routesResult,
      employeesResult,
      collectionsResult,
      returnsResult,
      visitsResult,
      targetsResult,
    ] = await Promise.all([
      this.rieFacade.getEntityRecords("Customers", ctx),
      this.rieFacade.getEntityRecords("Products", ctx),
      this.rieFacade.getEntityRecords("Invoices", ctx),
      this.rieFacade.getEntityRecords("Invoice Items", ctx),
      this.rieFacade.getEntityRecords("Routes", ctx),
      this.rieFacade.getEntityRecords("Employees", ctx),
      this.rieFacade.getEntityRecords("Collections", ctx),
      this.rieFacade.getEntityRecords("Returns", ctx),
      this.rieFacade.getEntityRecords("Visits", ctx),
      // Chart Color & Visual Intelligence Standard v1.0 — same RIE
      // Canonical "Targets" entity SGI's TARGET_BEHIND situation already
      // reads (Month/Year/RouteID/SalesTarget), loaded here independently
      // per this module's established per-module isolation convention.
      // Optional: a company with no Targets sheet uploaded simply gets an
      // unavailable result, which downstream just means every group's
      // `target` is null (Relative Semantic Coloring), never an error.
      this.rieFacade.getEntityRecords("Targets", ctx),
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
        if (!code) continue;
        productMeta.set(code, {
          name: String(p.ProductName ?? code),
          category: String(p.Category ?? "").trim(),
          brand: String(p.Brand ?? "").trim(),
        });
      }
    }

    const resolveRep = this.buildRepResolver(routesResult, employeesResult);

    // repEmail -> supervisorEmail, derived once from EVERY route (not just
    // routes that happen to have a matching Targets row) so supervisor-
    // level target aggregation below is complete even for a rep whose own
    // route has no Targets row this period but whose peers do.
    const repSupervisorMap = new Map<string, string | null>();
    for (const route of routesResult.records) {
      const routeId = String(route.RouteID ?? "").trim();
      if (!routeId) continue;
      const rep = resolveRep(routeId);
      if (rep) repSupervisorMap.set(rep.repEmail, rep.supervisorEmail);
    }

    const invoicesAvailable = invoicesResult.available && invoiceItemsResult.available;
    const salesRows: SalesRow[] = [];
    if (invoicesAvailable) {
      // No InvoiceStatus filter here — this join used to hard-require
      // "Confirmed", but that's an invented rule this module was the only
      // one applying: heatmap.service.ts and team-performance.service.ts
      // both join every invoice/invoice-item pair with no status gating at
      // all. Matching that existing behavior (not inventing new business
      // logic on top of it) after a live test showed this filter was
      // silently zeroing out every sales row.
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

    return {
      customerMeta,
      productMeta,
      resolveRep,
      repSupervisorMap,
      salesRows,
      invoicesAvailable,
      collectionsResult,
      returnsResult,
      visitsResult,
      targetsResult,
    };
  }

  // Chart Color & Visual Intelligence Standard v1.0 — repEmail -> summed
  // Sales target for the query window, from the RIE "Targets" entity.
  // Target rows are month-granular (Month/Year/RouteID/SalesTarget); a row
  // is included if its calendar month overlaps [fromTime, toTime] at all,
  // generalizing SGI's own single-calendar-month TARGET_BEHIND join to this
  // module's arbitrary date-range filter. A rep covering multiple routes,
  // or a window spanning multiple months, gets every matching row summed.
  private buildRepTargetTotals(
    targetsResult: EntityQueryResult,
    resolveRep: (routeId: string) => ResolvedRep | null,
    fromTime: number,
    toTime: number,
  ): Map<string, number> {
    const totals = new Map<string, number>();
    if (!targetsResult.available) return totals;
    for (const row of targetsResult.records) {
      const year = toFiniteNumber(row.Year);
      const month = toFiniteNumber(row.Month);
      if (year === null || month === null) continue;
      const periodStart = Date.UTC(year, month - 1, 1);
      const periodEnd = Date.UTC(year, month, 1) - 1;
      if (periodEnd < fromTime || periodStart > toTime) continue;
      const routeId = String(row.RouteID ?? "").trim();
      if (!routeId) continue;
      const rep = resolveRep(routeId);
      if (!rep) continue;
      const salesTarget = toFiniteNumber(row.SalesTarget) ?? 0;
      totals.set(rep.repEmail, (totals.get(rep.repEmail) ?? 0) + salesTarget);
    }
    return totals;
  }

  // Every filter array on DecisionFilters, compiled once into Sets (or null
  // = "no restriction on this axis") — shared by customer/product scope
  // checks below.
  private compileFilters(filters: DecisionFilters) {
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

  private windowFor(input: DecisionFilters): { fromTime: number; toTime: number; priorFromTime: number; priorToTime: number } {
    const fromTime = Date.parse(input.dateFrom);
    const toTime = Date.parse(input.dateTo);
    if (Number.isNaN(fromTime) || Number.isNaN(toTime)) throw new BadRequestException("dateFrom/dateTo must be valid dates");

    if (input.priorDateFrom && input.priorDateTo) {
      const priorFromTime = Date.parse(input.priorDateFrom);
      const priorToTime = Date.parse(input.priorDateTo);
      if (Number.isNaN(priorFromTime) || Number.isNaN(priorToTime)) throw new BadRequestException("priorDateFrom/priorDateTo must be valid dates");
      return { fromTime, toTime, priorFromTime, priorToTime };
    }
    // No prior window given — derive a same-length immediately-preceding
    // window ourselves, same convention SGI/Territory Intelligence use for
    // "current vs previous calendar period" comparisons.
    const windowMs = toTime - fromTime;
    const priorToTime = fromTime - 1;
    const priorFromTime = priorToTime - windowMs;
    return { fromTime, toTime, priorFromTime, priorToTime };
  }

  async query(user: AuthenticatedUser, input: DecisionQueryInput): Promise<DecisionQueryResult> {
    const { fromTime, toTime, priorFromTime, priorToTime } = this.windowFor(input);
    const { customerMeta, productMeta, resolveRep, repSupervisorMap, salesRows, invoicesAvailable, collectionsResult, returnsResult, visitsResult, targetsResult } =
      await this.loadContext(user);
    const f = this.compileFilters(input);

    // Customer-level scope check — City/Channel/Branch/Customer filters
    // directly, Rep/Supervisor via that customer's OWN Customers.RouteID
    // (current assignment, not each invoice's own RouteID snapshot — a
    // documented simplification: this module scopes people by who owns the
    // customer today, not who happened to write a given historical invoice).
    const customerInScope = (code: string): boolean => {
      const meta = customerMeta.get(code);
      if (!meta) return false;
      if (f.city && !f.city.has(meta.city)) return false;
      if (f.channel && !f.channel.has(meta.channel)) return false;
      if (f.branch && !f.branch.has(meta.branchId)) return false;
      if (f.customer && !f.customer.has(code)) return false;
      if (f.rep || f.supervisor) {
        const rep = resolveRep(meta.routeId);
        if (f.rep && (!rep || !f.rep.has(rep.repEmail))) return false;
        if (f.supervisor && (!rep || !rep.supervisorEmail || !f.supervisor.has(rep.supervisorEmail))) return false;
      }
      return true;
    };

    const productInScope = (code: string): boolean => {
      const meta = productMeta.get(code);
      if (!meta) return !f.category && !f.brand && !f.product;
      if (f.category && !f.category.has(meta.category)) return false;
      if (f.brand && !f.brand.has(meta.brand)) return false;
      if (f.product && !f.product.has(code)) return false;
      return true;
    };

    const rowInScope = (row: SalesRow): boolean => customerInScope(row.customerCode) && productInScope(row.productCode);

    const currentRows = salesRows.filter((r) => r.time !== null && r.time >= fromTime && r.time <= toTime && rowInScope(r));
    const priorRows = salesRows.filter((r) => r.time !== null && r.time >= priorFromTime && r.time <= priorToTime && rowInScope(r));

    const sales = currentRows.reduce((sum, r) => sum + r.amount, 0);
    const salesPrior = priorRows.reduce((sum, r) => sum + r.amount, 0);
    const salesGrowthPct = invoicesAvailable ? (salesPrior > 0 ? ((sales - salesPrior) / salesPrior) * 100 : null) : null;
    const ordersCount = new Set(currentRows.map((r) => r.invoiceNo)).size;
    const averageOrderValue = ordersCount > 0 ? sales / ordersCount : null;
    const activeCustomersCount = new Set(currentRows.map((r) => r.customerCode)).size;

    // ---- Collections / Returns — customer+rep filters apply; Category/
    // Brand/Product filters do not (neither entity carries a ProductCode),
    // same documented limitation as Territory Intelligence's collection
    // metric. ----
    let collections: number | null = null;
    if (collectionsResult.available) {
      collections = 0;
      for (const row of collectionsResult.records) {
        const t = toEpochMs(row.CollectionDate);
        if (t === null || t < fromTime || t > toTime) continue;
        const code = String(row.CustomerCode ?? "").trim();
        if (!code || !customerInScope(code)) continue;
        collections += toFiniteNumber(row.Amount) ?? 0;
      }
    }

    let returns: number | null = null;
    if (returnsResult.available) {
      returns = 0;
      for (const row of returnsResult.records) {
        const t = toEpochMs(row.ReturnDate);
        if (t === null || t < fromTime || t > toTime) continue;
        const code = String(row.CustomerCode ?? "").trim();
        if (!code || !customerInScope(code)) continue;
        returns += toFiniteNumber(row.TotalAmount) ?? 0;
      }
    }

    // ---- Visits: Coverage / Strike Rate / Productivity. Product-level
    // filters don't apply (Visits carries no ProductCode). ----
    let coveragePct: number | null = null;
    let strikeRatePct: number | null = null;
    let productivity: number | null = null;
    if (visitsResult.available) {
      let totalVisits = 0;
      let productiveVisits = 0;
      const visitedCustomers = new Set<string>();
      for (const v of visitsResult.records) {
        const t = toEpochMs(v.VisitDate);
        if (t === null || t < fromTime || t > toTime) continue;
        const code = String(v.CustomerCode ?? "").trim();
        if (!code || !customerInScope(code)) continue;
        totalVisits++;
        visitedCustomers.add(code);
        if (String(v.VisitStatus ?? "").trim() === "Productive") productiveVisits++;
      }
      strikeRatePct = totalVisits > 0 ? Math.round((productiveVisits / totalVisits) * 100) : null;
      // Confirmed business definition (2026-07-22): Sales / Productive Visits.
      productivity = productiveVisits > 0 ? sales / productiveVisits : null;

      let totalInScopeCustomers = 0;
      for (const code of customerMeta.keys()) if (customerInScope(code)) totalInScopeCustomers++;
      coveragePct = totalInScopeCustomers > 0 ? Math.round((visitedCustomers.size / totalInScopeCustomers) * 100) : null;
    }

    // ---- AI Insights + Lost Sales value: reused from SGI's already-
    // persisted situations, never re-derived, never a live LLM call. ----
    const sgiData = await this.sgiService.getLatest(user);
    let lostSalesValue = 0;
    const inScopeSituations: SgiSituation[] = [];
    const anyNonPeopleFilterActive = Boolean(f.city || f.channel || f.branch || f.category || f.brand || f.product || f.customer);
    if (sgiData) {
      const repSupervisorFromSgi = new Map<string, string | null>();
      for (const d of sgiData.repDirectory) repSupervisorFromSgi.set(d.email, d.supervisorEmail);

      for (const s of sgiData.situations) {
        let inScope: boolean;
        if (s.entityType === "customer") {
          inScope = customerInScope(s.entityKey.trim());
        } else {
          const repEmail = s.entityKey.trim();
          inScope = !anyNonPeopleFilterActive; // rep-type situations have no customer/product link to verify against those filters
          if (inScope && f.rep) inScope = f.rep.has(repEmail);
          if (inScope && f.supervisor) {
            const sup = repSupervisorFromSgi.get(repEmail) ?? null;
            inScope = Boolean(sup && f.supervisor.has(sup));
          }
        }
        if (!inScope) continue;
        inScopeSituations.push(s);
        if (s.type === "LOST_SALES") lostSalesValue += s.metricValuePrior ?? 0;
      }
    }

    const severityRank: Record<SgiSituation["severity"], number> = { high: 0, medium: 1, low: 2 };
    const insights: DecisionInsightItem[] = [...inScopeSituations]
      .sort((a, b) => {
        const sevDiff = severityRank[a.severity] - severityRank[b.severity];
        if (sevDiff !== 0) return sevDiff;
        return Math.abs(b.metricValue - (b.metricValuePrior ?? 0)) - Math.abs(a.metricValue - (a.metricValuePrior ?? 0));
      })
      .slice(0, 8)
      .map((s) => ({ type: s.type, severity: s.severity, label: s.title, detail: s.detail }));

    const kpis: DecisionKpiSummary = {
      sales,
      salesGrowthPct,
      collections,
      returns,
      lostSalesValue,
      ordersCount,
      averageOrderValue,
      activeCustomersCount,
      coveragePct,
      strikeRatePct,
      productivity,
    };

    const repTargetTotals = this.buildRepTargetTotals(targetsResult, resolveRep, fromTime, toTime);
    const chart = this.buildChartGroups(input.analyzeBy, currentRows, priorRows, customerMeta, productMeta, resolveRep, repTargetTotals, repSupervisorMap);
    const heatmap = this.buildHeatmap(currentRows, customerMeta);

    return {
      kpis,
      chart,
      heatmap,
      insights,
      generatedAt: new Date().toISOString(),
      datasetsAvailable: {
        invoices: invoicesAvailable,
        collections: collectionsResult.available,
        returns: returnsResult.available,
        visits: visitsResult.available,
      },
    };
  }

  // Groups already-filtered current/prior sales rows by the requested
  // Analyze-By dimension. Collections/Returns are not computed per-group
  // (see comment at the return mapping below) — always null, never a
  // fabricated 0.
  private buildChartGroups(
    dimension: DecisionAnalyzeByDimension,
    currentRows: SalesRow[],
    priorRows: SalesRow[],
    customerMeta: Map<string, CustomerMeta>,
    productMeta: Map<string, ProductMeta>,
    resolveRep: (routeId: string) => ResolvedRep | null,
    repTargetTotals: Map<string, number>,
    repSupervisorMap: Map<string, string | null>,
  ): DecisionChartGroup[] {
    const isProductDimension = dimension === "category" || dimension === "brand" || dimension === "product";

    const keyFor = (row: SalesRow): { key: string; label: string } | null => {
      if (isProductDimension) {
        const p = productMeta.get(row.productCode);
        if (!p) return null;
        if (dimension === "category") return p.category ? { key: p.category, label: p.category } : null;
        if (dimension === "brand") return p.brand ? { key: p.brand, label: p.brand } : null;
        return { key: row.productCode, label: p.name };
      }
      const c = customerMeta.get(row.customerCode);
      if (!c) return null;
      if (dimension === "territory") return c.city ? { key: c.city, label: c.city } : null;
      if (dimension === "channel") return c.channel ? { key: c.channel, label: c.channel } : null;
      if (dimension === "customer") return { key: row.customerCode, label: c.name };
      const rep = resolveRep(c.routeId);
      if (!rep) return null;
      if (dimension === "representative") return { key: rep.repEmail, label: rep.repName };
      return rep.supervisorEmail ? { key: rep.supervisorEmail, label: rep.supervisorName ?? rep.supervisorEmail } : null;
    };

    const groups = new Map<string, GroupAcc>();
    const getOrCreate = (key: string, label: string): GroupAcc => {
      let g = groups.get(key);
      if (!g) {
        g = { label, sales: 0, salesPrior: 0, orderNos: new Set(), customerCodes: new Set() };
        groups.set(key, g);
      }
      return g;
    };

    for (const row of currentRows) {
      const k = keyFor(row);
      if (!k) continue;
      const g = getOrCreate(k.key, k.label);
      g.sales += row.amount;
      g.orderNos.add(row.invoiceNo);
      g.customerCodes.add(row.customerCode);
    }
    for (const row of priorRows) {
      const k = keyFor(row);
      if (!k) continue;
      const g = getOrCreate(k.key, k.label);
      g.salesPrior += row.amount;
    }

    // Chart Color & Visual Intelligence Standard v1.0 — target per group,
    // only meaningful for representative/supervisor. Representative: direct
    // lookup by repEmail (the group key). Supervisor: sum of every rep's
    // target whose repSupervisorMap entry points at this supervisor (the
    // group key) — a rep with no Targets row this period contributes
    // nothing (not a fabricated 0), so a supervisor with zero reps having
    // targets correctly ends up null via the `hasAny` guard below.
    const targetForKey = (key: string): number | null => {
      if (dimension === "representative") return repTargetTotals.has(key) ? repTargetTotals.get(key)! : null;
      if (dimension === "supervisor") {
        let sum = 0;
        let hasAny = false;
        for (const [repEmail, supervisorEmail] of repSupervisorMap.entries()) {
          if (supervisorEmail !== key) continue;
          const t = repTargetTotals.get(repEmail);
          if (t !== undefined) {
            sum += t;
            hasAny = true;
          }
        }
        return hasAny ? sum : null;
      }
      return null; // no target concept for territory/channel/category/brand/product/customer
    };

    return Array.from(groups.entries())
      .map(([key, g]) => ({
        key,
        label: g.label,
        sales: g.sales,
        salesPriorPct: g.salesPrior > 0 ? ((g.sales - g.salesPrior) / g.salesPrior) * 100 : null,
        // Collections/Returns are not attributable per Analyze-By group with
        // the current data model (a Collection/Return links to a Customer,
        // not to a specific Category/Brand/Product/etc. line) — honestly
        // null here, never a fabricated 0. The company-wide totals are
        // still available via the top-level KPI summary.
        collections: null,
        returns: null,
        ordersCount: g.orderNos.size,
        activeCustomersCount: g.customerCodes.size,
        target: targetForKey(key),
      }))
      .sort((a, b) => b.sales - a.sales);
  }

  // Mini Heat Map — always City-grouped regardless of the active
  // Analyze-By dimension, from the same already-filtered current rows.
  //
  // 2026-07-22 root-cause fix: this used to `continue` (drop the row
  // entirely, contributing to neither this map NOR any city bucket) whenever
  // a customer's `City` text field was empty — even though the customer's
  // own Latitude/Longitude might be perfectly valid. That's WHY this map
  // could show far fewer points than Geo Engine's map for the exact same
  // underlying data: Geo Engine's `customerPoints` builder only requires a
  // valid coordinate pair (see geo-engine.service.ts's `isSaneCoordinate`
  // check), it never requires `City` to be non-empty — a customer with no
  // City text still gets plotted there under `city: meta.city` (empty
  // string) with no gate on it. This function now matches that: any
  // customer with a sane coordinate pair is included, using `c.city ||
  // c.name` as the fallback grouping key/label when City is blank (the
  // customer's own name becomes its own "city" bucket, same fallback
  // Geo Engine's `groupByCity` already uses) — so sales are never silently
  // dropped from this map just because the City column wasn't filled in.
  private buildHeatmap(currentRows: SalesRow[], customerMeta: Map<string, CustomerMeta>): DecisionHeatmapTerritory[] {
    interface CityAcc {
      name: string;
      sales: number;
      latSum: number;
      lonSum: number;
      coordCount: number;
    }
    const cities = new Map<string, CityAcc>();
    for (const row of currentRows) {
      const c = customerMeta.get(row.customerCode);
      if (!c) continue;
      const label = c.city || c.name;
      const id = slugify(label);
      let acc = cities.get(id);
      if (!acc) {
        acc = { name: label, sales: 0, latSum: 0, lonSum: 0, coordCount: 0 };
        cities.set(id, acc);
      }
      acc.sales += row.amount;
      if (c.lat !== null && c.lon !== null && isSaneCoordinate(c.lat, c.lon)) {
        acc.latSum += c.lat;
        acc.lonSum += c.lon;
        acc.coordCount += 1;
      }
    }
    // Cities where NONE of their in-scope customers have a valid Latitude/
    // Longitude are dropped here rather than emitted at a fabricated (0,0) —
    // that used to silently plot a phantom point off the coast of Africa
    // (Null Island) and, worse, could drag the mini-map's fitBounds out to
    // an absurd zoom level trying to include it alongside the real points.
    // A city with real sales but no coordinates simply isn't mappable; it's
    // still fully counted in the top-level KPI totals, just not on this map.
    return Array.from(cities.entries())
      .filter(([, acc]) => acc.coordCount > 0)
      .map(([id, acc]) => ({
        id,
        name: acc.name,
        lat: acc.latSum / acc.coordCount,
        lon: acc.lonSum / acc.coordCount,
        sales: acc.sales,
      }));
  }

  async filterOptions(user: AuthenticatedUser, field: DecisionFilterField): Promise<DecisionFilterOptionsResult> {
    const ctx = this.rieContext(user);

    if (field === "branch") {
      const result = await this.rieFacade.getEntityRecords("Branches", ctx);
      this.assertAvailable(result, "الفروع");
      const seen = new Map<string, string>();
      for (const row of result.records) {
        const id = String(row.BranchID ?? "").trim();
        if (id && !seen.has(id)) seen.set(id, String(row.BranchName ?? id));
      }
      return { options: this.sortedOptions(seen) };
    }

    if (field === "territory" || field === "channel" || field === "customer") {
      const result = await this.rieFacade.getEntityRecords("Customers", ctx);
      this.assertAvailable(result, "العملاء");
      const seen = new Map<string, string>();
      for (const row of result.records) {
        if (field === "customer") {
          const code = String(row.CustomerCode ?? "").trim();
          if (code && !seen.has(code)) seen.set(code, String(row.CustomerName ?? code));
          continue;
        }
        const column = field === "territory" ? "City" : "Channel";
        const value = String(row[column] ?? "").trim();
        if (value) seen.set(value, value);
      }
      return { options: this.sortedOptions(seen) };
    }

    if (field === "category" || field === "brand" || field === "product") {
      const result = await this.rieFacade.getEntityRecords("Products", ctx);
      this.assertAvailable(result, "المنتجات");
      const seen = new Map<string, string>();
      for (const row of result.records) {
        if (field === "product") {
          const code = String(row.ProductCode ?? "").trim();
          if (code && !seen.has(code)) seen.set(code, String(row.ProductName ?? code));
          continue;
        }
        const column = field === "category" ? "Category" : "Brand";
        const value = String(row[column] ?? "").trim();
        if (value) seen.set(value, value);
      }
      return { options: this.sortedOptions(seen) };
    }

    // representative / supervisor — derived from Routes+Employees via the
    // same resolver used everywhere else in this module.
    const [routesResult, employeesResult] = await Promise.all([this.rieFacade.getEntityRecords("Routes", ctx), this.rieFacade.getEntityRecords("Employees", ctx)]);
    this.assertAvailable(routesResult, "المسارات");
    const resolveRep = this.buildRepResolver(routesResult, employeesResult);
    const seen = new Map<string, string>();
    for (const route of routesResult.records) {
      const routeId = String(route.RouteID ?? "").trim();
      if (!routeId) continue;
      const rep = resolveRep(routeId);
      if (!rep) continue;
      if (field === "representative") {
        if (!seen.has(rep.repEmail)) seen.set(rep.repEmail, rep.repName);
      } else if (rep.supervisorEmail && !seen.has(rep.supervisorEmail)) {
        seen.set(rep.supervisorEmail, rep.supervisorName ?? rep.supervisorEmail);
      }
    }
    return { options: this.sortedOptions(seen) };
  }

  private sortedOptions(map: Map<string, string>): { value: string; label: string }[] {
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async table(user: AuthenticatedUser, input: DecisionTableQueryInput): Promise<DecisionTableResult> {
    const { fromTime, toTime } = this.windowFor(input);
    const { customerMeta, productMeta, resolveRep, salesRows } = await this.loadContext(user);
    const f = this.compileFilters(input);

    const customerInScope = (code: string): boolean => {
      const meta = customerMeta.get(code);
      if (!meta) return false;
      if (f.city && !f.city.has(meta.city)) return false;
      if (f.channel && !f.channel.has(meta.channel)) return false;
      if (f.branch && !f.branch.has(meta.branchId)) return false;
      if (f.customer && !f.customer.has(code)) return false;
      if (f.rep || f.supervisor) {
        const rep = resolveRep(meta.routeId);
        if (f.rep && (!rep || !f.rep.has(rep.repEmail))) return false;
        if (f.supervisor && (!rep || !rep.supervisorEmail || !f.supervisor.has(rep.supervisorEmail))) return false;
      }
      return true;
    };
    const productInScope = (code: string): boolean => {
      const meta = productMeta.get(code);
      if (!meta) return !f.category && !f.brand && !f.product;
      if (f.category && !f.category.has(meta.category)) return false;
      if (f.brand && !f.brand.has(meta.brand)) return false;
      if (f.product && !f.product.has(code)) return false;
      return true;
    };

    const matching = salesRows.filter((r) => r.time !== null && r.time >= fromTime && r.time <= toTime && customerInScope(r.customerCode) && productInScope(r.productCode));
    matching.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));

    const totalRows = matching.length;
    const start = (input.page - 1) * input.pageSize;
    const page = matching.slice(start, start + input.pageSize);

    const rows: DecisionTableRow[] = page.map((r) => {
      const c = customerMeta.get(r.customerCode);
      const p = productMeta.get(r.productCode);
      const rep = c ? resolveRep(c.routeId) : null;
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
}
