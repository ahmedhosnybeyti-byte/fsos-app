import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  TerritoryCustomerMetric,
  TerritoryCustomerPoint,
  TerritoryCustomerPointsResult,
  TerritoryExecutiveItem,
  TerritoryHealthTier,
  TerritoryIntelligenceExecutiveResponse,
  TerritoryIntelligenceSummaryResponse,
  TerritoryMetrics,
  TerritorySummaryItem,
  TerritoryWhyItem,
  SgiSituation,
} from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";
import { SgiService } from "../sgi/sgi.service";

// Territory Intelligence — groups Customers by City (the only geographic
// grouping key with real, reliable data behind it anywhere in the Canonical
// Schema; there is no territory/region/GeoJSON-polygon concept in this
// platform) and layers already-computed SGI situations on top (see
// sgi.service.ts) rather than re-running situation detection. TARGET_BEHIND
// is rep-level, not geographic, and is excluded entirely from grouping.

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

// Same rounding + ar-EG locale convention as sgi.service.ts's fmt() —
// reused here so amounts read consistently with the situations they're
// derived from.
function fmt(n: number): string {
  return Math.round(n).toLocaleString("ar-EG");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// Lowercase, trim, collapse whitespace runs to "-", strip everything
// outside [a-z0-9, Arabic block, hyphen]. Arabic city names must survive
// this slug intact, so the Arabic Unicode range (؀-ۿ) is
// deliberately kept rather than stripped. Two different City strings that
// slugify to the same id are treated as the same territory by design (they
// were effectively the same city, differing only in incidental formatting).
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9؀-ۿ-]/g, "");
}

// Equal-weight V1 default. Kept as a named const (rather than inlined
// literals) so a future admin-configurable version of the Health Score can
// swap this object out without touching the scoring logic itself.
const DEFAULT_HEALTH_SCORE_WEIGHTS = {
  salesGrowth: 0.2,
  activeCustomerRate: 0.2,
  lostSales: 0.2,
  visitCoverage: 0.2,
  collectionHealth: 0.2,
};

// Every SGI situation type except TARGET_BEHIND is customer-level (see
// sgi.service.ts) and therefore geographically attributable via
// entityKey -> Customer.CustomerCode -> City.
type TerritorySituationType = Exclude<SgiSituation["type"], "TARGET_BEHIND">;

const RECOMMENDATION_BY_TYPE: Record<TerritorySituationType, (name: string) => string> = {
  LOST_SALES: (name) => `ركّز على استعادة العملاء اللي توقفوا عن الشراء في ${name} — ابدأ بالأعلى قيمة قبل ما يتحولوا لمنافس.`,
  CUSTOMER_INACTIVE: (name) => `فيه عملاء خاملين في ${name} — جدول زيارات إعادة تنشيط عاجلة.`,
  COLLECTION_RISK: (name) => `نسبة التحصيل في ${name} أقل من المتوقع — تابع التحصيلات المعلقة قبل ما تتراكم.`,
  GROWTH_OPPORTUNITY: (name) => `فيه فرصة نمو حقيقية في ${name} — وسّع توزيع المنتجات الرايجة عند العملاء المشابهين.`,
  CUSTOMER_DECLINING: (name) => `عدد من عملاء ${name} في تراجع — رتّب زيارات متابعة قبل ما يتحولوا لعملاء خاملين.`,
  PRODUCT_DECLINE: (name) => `فيه تراجع في صنف معين داخل ${name} — راجع التوزيع والعرض في المنافذ المتأثرة.`,
};

interface TerritoryAcc {
  name: string;
  customerCodes: Set<string>;
  latSum: number;
  lonSum: number;
  coordCount: number;
}

interface SalesAcc {
  current: number;
  prior: number;
  activeCurrent: Set<string>;
}

@Injectable()
export class TerritoryIntelligenceService {
  constructor(
    private readonly rieFacade: RieFacade,
    private readonly sgiService: SgiService,
  ) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  private assertEntityAvailable(result: EntityQueryResult, arabicLabel: string): void {
    if (!result.available) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  async getSummary(user: AuthenticatedUser): Promise<TerritoryIntelligenceSummaryResponse> {
    const ctx = this.rieContext(user);

    // Current calendar month vs previous calendar month — same window
    // convention as sgi.service.ts's recalculateForCompany().
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const fromTime = monthStart.getTime();
    const toTime = now.getTime();
    const priorFromTime = prevMonthStart.getTime();
    const priorToTime = prevMonthEnd.getTime();

    const [customersResult, invoicesResult, visitsResult, sgiData] = await Promise.all([
      this.rieFacade.getEntityRecords("Customers", ctx),
      this.rieFacade.getEntityRecords("Invoices", ctx),
      this.rieFacade.getEntityRecords("Visits", ctx),
      this.sgiService.getLatest(user),
    ]);
    this.assertEntityAvailable(customersResult, "العملاء");

    const invoicesAvailable = invoicesResult.available;
    const visitsAvailable = visitsResult.available;

    // ---- Group customers by City (trimmed, non-empty only). ----
    const territories = new Map<string, TerritoryAcc>();
    const customerTerritory = new Map<string, string>(); // CustomerCode -> territory id

    for (const c of customersResult.records) {
      const city = String(c.City ?? "").trim();
      if (!city) continue;
      const code = String(c.CustomerCode ?? "").trim();
      if (!code) continue;

      const id = slugify(city);
      let acc = territories.get(id);
      if (!acc) {
        acc = { name: city, customerCodes: new Set(), latSum: 0, lonSum: 0, coordCount: 0 };
        territories.set(id, acc);
      }
      acc.customerCodes.add(code);
      customerTerritory.set(code, id);

      const lat = toFiniteNumber(c.Latitude);
      const lon = toFiniteNumber(c.Longitude);
      if (lat !== null && lon !== null) {
        acc.latSum += lat;
        acc.lonSum += lon;
        acc.coordCount += 1;
      }
    }

    // ---- Invoices join (Confirmed only) — degrades to null-per-territory
    // metrics rather than blocking the whole screen when unavailable. ----
    const salesByTerritory = new Map<string, SalesAcc>();
    const getOrCreateSales = (id: string): SalesAcc => {
      let s = salesByTerritory.get(id);
      if (!s) {
        s = { current: 0, prior: 0, activeCurrent: new Set() };
        salesByTerritory.set(id, s);
      }
      return s;
    };

    if (invoicesAvailable) {
      for (const inv of invoicesResult.records) {
        if (String(inv.InvoiceStatus ?? "").trim() !== "Confirmed") continue;
        const code = String(inv.CustomerCode ?? "").trim();
        if (!code) continue;
        const territoryId = customerTerritory.get(code);
        if (!territoryId) continue;
        const t = toEpochMs(inv.InvoiceDate);
        if (t === null) continue;
        const amount = toFiniteNumber(inv.TotalAfterVAT) ?? 0;

        const s = getOrCreateSales(territoryId);
        if (t >= fromTime && t <= toTime) {
          s.current += amount;
          s.activeCurrent.add(code);
        }
        if (t >= priorFromTime && t <= priorToTime) {
          s.prior += amount;
        }
      }
    }

    // ---- Visits join (current window only). ----
    const visitCustomersByTerritory = new Map<string, Set<string>>();
    if (visitsAvailable) {
      for (const v of visitsResult.records) {
        const code = String(v.CustomerCode ?? "").trim();
        if (!code) continue;
        const territoryId = customerTerritory.get(code);
        if (!territoryId) continue;
        const t = toEpochMs(v.VisitDate);
        if (t === null || t < fromTime || t > toTime) continue;

        const set = visitCustomersByTerritory.get(territoryId) ?? new Set<string>();
        set.add(code);
        visitCustomersByTerritory.set(territoryId, set);
      }
    }

    // ---- SGI situations, excluding TARGET_BEHIND (rep-level, not
    // geographic), grouped by territory via entityKey -> CustomerCode. ----
    const situationsByTerritory = new Map<string, SgiSituation[]>();
    if (sgiData) {
      for (const s of sgiData.situations) {
        if (s.type === "TARGET_BEHIND" || s.entityType !== "customer") continue;
        const code = s.entityKey.trim();
        const territoryId = customerTerritory.get(code);
        if (!territoryId) continue;
        const arr = situationsByTerritory.get(territoryId) ?? [];
        arr.push(s);
        situationsByTerritory.set(territoryId, arr);
      }
    }

    const severityRank: Record<SgiSituation["severity"], number> = { high: 0, medium: 1, low: 2 };

    const items: TerritorySummaryItem[] = [];
    for (const [id, acc] of territories) {
      const customerCount = acc.customerCodes.size;
      const lat = acc.coordCount > 0 ? acc.latSum / acc.coordCount : 0;
      const lon = acc.coordCount > 0 ? acc.lonSum / acc.coordCount : 0;

      const sales = salesByTerritory.get(id);
      const salesCurrent = sales?.current ?? 0;
      const salesPrior = sales?.prior ?? 0;
      const salesGrowthPct = invoicesAvailable ? (salesPrior > 0 ? ((salesCurrent - salesPrior) / salesPrior) * 100 : null) : null;

      const activeCount = sales?.activeCurrent.size ?? 0;
      const activeCustomerRatePct = invoicesAvailable ? Math.round((activeCount / customerCount) * 100) : 0;

      const territorySituations = situationsByTerritory.get(id) ?? [];
      const lostSalesCount = territorySituations.filter((s) => s.type === "LOST_SALES").length;

      const visitSet = visitCustomersByTerritory.get(id);
      const visitCoveragePct = visitsAvailable ? Math.round(((visitSet?.size ?? 0) / customerCount) * 100) : null;

      const collectionRiskCount = territorySituations.filter((s) => s.type === "COLLECTION_RISK").length;
      const collectionHealthPct = sgiData === null ? null : clamp(100 - (collectionRiskCount / customerCount) * 100, 0, 100);

      const metrics: TerritoryMetrics = {
        salesGrowthPct,
        activeCustomerRatePct,
        lostSalesCount,
        visitCoveragePct,
        collectionHealthPct,
      };

      // ---- Health Score: weighted average of 0-100 "goodness" scores,
      // renormalized over whichever components are actually available. ----
      const components: Array<{ score: number; weight: number }> = [];
      if (salesGrowthPct !== null) {
        components.push({ score: clamp(salesGrowthPct, -50, 50) + 50, weight: DEFAULT_HEALTH_SCORE_WEIGHTS.salesGrowth });
      }
      components.push({ score: clamp(activeCustomerRatePct, 0, 100), weight: DEFAULT_HEALTH_SCORE_WEIGHTS.activeCustomerRate });
      const lostSalesRatePct = (lostSalesCount / customerCount) * 100;
      components.push({ score: clamp(100 - lostSalesRatePct, 0, 100), weight: DEFAULT_HEALTH_SCORE_WEIGHTS.lostSales });
      if (visitCoveragePct !== null) {
        components.push({ score: clamp(visitCoveragePct, 0, 100), weight: DEFAULT_HEALTH_SCORE_WEIGHTS.visitCoverage });
      }
      if (collectionHealthPct !== null) {
        components.push({ score: clamp(collectionHealthPct, 0, 100), weight: DEFAULT_HEALTH_SCORE_WEIGHTS.collectionHealth });
      }
      const weightSum = components.reduce((sum, c) => sum + c.weight, 0);
      // activeCustomerRate + lostSales components are always pushed
      // unconditionally above, so weightSum is never zero in practice — the
      // 50 fallback is a defensive no-op, never actually reached.
      const healthScore =
        weightSum > 0 ? clamp(Math.round(components.reduce((sum, c) => sum + c.score * c.weight, 0) / weightSum), 0, 100) : 50;

      const tier: TerritoryHealthTier =
        healthScore >= 80 ? "excellent" : healthScore >= 60 ? "good" : healthScore >= 40 ? "average" : healthScore >= 20 ? "weak" : "veryWeak";

      // ---- why: top 5 situations, severity first then magnitude. ----
      const sortedSituations = [...territorySituations].sort((a, b) => {
        const sevDiff = severityRank[a.severity] - severityRank[b.severity];
        if (sevDiff !== 0) return sevDiff;
        const magA = Math.abs(a.metricValue - (a.metricValuePrior ?? 0));
        const magB = Math.abs(b.metricValue - (b.metricValuePrior ?? 0));
        return magB - magA;
      });
      const topSituations = sortedSituations.slice(0, 5);
      const why: TerritoryWhyItem[] = topSituations.map((s) => ({
        type: s.type as TerritorySituationType,
        severity: s.severity,
        label: s.title,
        detail: s.detail,
      }));

      const recommendation =
        topSituations.length === 0
          ? `الأداء في ${acc.name} مستقر — حافظ على وتيرة الزيارات الحالية.`
          : RECOMMENDATION_BY_TYPE[topSituations[0]!.type as TerritorySituationType](acc.name);

      // Reuses each situation's own SGI-generated recommendation verbatim —
      // no regeneration.
      const suggestedActions = topSituations.slice(0, 4).map((s) => s.recommendation);

      let opportunityValueSar = 0;
      for (const s of territorySituations) {
        if (s.type === "GROWTH_OPPORTUNITY") opportunityValueSar += s.metricValue;
        else if (s.type === "LOST_SALES") opportunityValueSar += s.metricValuePrior ?? 0;
      }
      const expectedImpactSar = sgiData === null ? null : opportunityValueSar;

      items.push({
        id,
        name: acc.name,
        lat,
        lon,
        customerCount,
        healthScore,
        tier,
        metrics,
        why,
        recommendation,
        suggestedActions,
        expectedImpactSar,
        opportunityValueSar,
      });
    }

    // Worst-first — matches "manager's eye goes to red regions" from the
    // design doc.
    items.sort((a, b) => a.healthScore - b.healthScore);

    return {
      territories: items,
      generatedAt: new Date().toISOString(),
      groupedBy: "City",
    };
  }

  // 2026-07-30 — per-customer version of the same 7 metrics getSummary()
  // computes per City, for Territory Intelligence's points/cluster/heat
  // map (territory-point-map.tsx). Explicit product requirement: reuse the
  // SAME formulas/thresholds already written above, not different logic —
  // so this method mirrors getSummary()'s current/prior-month window,
  // DEFAULT_HEALTH_SCORE_WEIGHTS, and clamp() calls exactly, just
  // accumulated per CustomerCode instead of per City.
  //
  // Per-customer reinterpretation of each metric (documented since a
  // straight copy of the City-level ratio doesn't make sense for one
  // customer — see the design note in territory-customer-points research):
  //   - salesGrowthPct: same formula, current vs prior spend for THIS
  //     customer (was already effectively per-customer before city-level
  //     summing).
  //   - activeCustomerRatePct's per-customer analogue: 100 if this
  //     customer bought anything in the current window, else 0 — same
  //     "active this period" concept getSummary() sums into a %.
  //   - lostSalesCount: 1 if this customer has a LOST_SALES situation
  //     (current === 0 && prior > 0), else 0 — getSummary() counts exactly
  //     these situations per territory; here there's at most one per
  //     customer.
  //   - visitCoveragePct: 100 if this customer was visited in the current
  //     window, else 0 — same Visits join getSummary() already does,
  //     collapsed to one customer instead of a city ratio.
  //   - collectionHealthPct: collectionCurrent/current*100 for THIS
  //     customer, same ratio SGI's own COLLECTION_RISK situation builder
  //     computes (sgi.service.ts) — not the city-level
  //     clamp(100 - riskCount/customerCount*100) reduction, which has no
  //     single-customer meaning.
  //   - opportunityValueSar: this customer's own GROWTH_OPPORTUNITY +
  //     LOST_SALES situation values summed — identical to how getSummary()
  //     sums them per territory, just not re-summed across customers.
  //   - riskLevel: 100 - healthScore, unchanged arithmetic.
  //   - healthScore: identical weighted-average/clamp formula, fed these
  //     single-customer 0-100 components.
  async getCustomerPoints(user: AuthenticatedUser, metric: TerritoryCustomerMetric, city?: string): Promise<TerritoryCustomerPointsResult> {
    const ctx = this.rieContext(user);

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const fromTime = monthStart.getTime();
    const toTime = now.getTime();
    const priorFromTime = prevMonthStart.getTime();
    const priorToTime = prevMonthEnd.getTime();

    const [customersResult, invoicesResult, visitsResult, collectionsResult, sgiData] = await Promise.all([
      this.rieFacade.getEntityRecords("Customers", ctx),
      this.rieFacade.getEntityRecords("Invoices", ctx),
      this.rieFacade.getEntityRecords("Visits", ctx),
      this.rieFacade.getEntityRecords("Collections", ctx),
      this.sgiService.getLatest(user),
    ]);
    this.assertEntityAvailable(customersResult, "العملاء");

    const invoicesAvailable = invoicesResult.available;
    const visitsAvailable = visitsResult.available;
    const collectionsAvailable = collectionsResult.available;

    let customerRecords = customersResult.records;
    if (city && city.trim()) {
      const target = city.trim();
      customerRecords = customerRecords.filter((row) => String(row.City ?? "").trim() === target);
      if (customerRecords.length === 0) {
        throw new BadRequestException(`لا يوجد عملاء في المدينة "${target}"`);
      }
    }

    interface CustomerPointAcc {
      name: string;
      lat: number | null;
      lon: number | null;
      current: number;
      prior: number;
      collectionCurrent: number;
    }
    const byCustomer = new Map<string, CustomerPointAcc>();
    for (const c of customerRecords) {
      const code = String(c.CustomerCode ?? "").trim();
      if (!code) continue;
      const lat = toFiniteNumber(c.Latitude);
      const lon = toFiniteNumber(c.Longitude);
      byCustomer.set(code, { name: String(c.CustomerName ?? code), lat, lon, current: 0, prior: 0, collectionCurrent: 0 });
    }

    if (invoicesAvailable) {
      for (const inv of invoicesResult.records) {
        if (String(inv.InvoiceStatus ?? "").trim() !== "Confirmed") continue;
        const code = String(inv.CustomerCode ?? "").trim();
        const acc = byCustomer.get(code);
        if (!acc) continue;
        const t = toEpochMs(inv.InvoiceDate);
        if (t === null) continue;
        const amount = toFiniteNumber(inv.TotalAfterVAT) ?? 0;
        if (t >= fromTime && t <= toTime) acc.current += amount;
        if (t >= priorFromTime && t <= priorToTime) acc.prior += amount;
      }
    }

    if (collectionsAvailable) {
      for (const row of collectionsResult.records) {
        const code = String(row.CustomerCode ?? "").trim();
        const acc = byCustomer.get(code);
        if (!acc) continue;
        const t = toEpochMs(row.CollectionDate);
        if (t === null || t < fromTime || t > toTime) continue;
        acc.collectionCurrent += toFiniteNumber(row.Amount) ?? 0;
      }
    }

    const visitedThisWindow = new Set<string>();
    if (visitsAvailable) {
      for (const v of visitsResult.records) {
        const code = String(v.CustomerCode ?? "").trim();
        if (!byCustomer.has(code)) continue;
        const t = toEpochMs(v.VisitDate);
        if (t === null || t < fromTime || t > toTime) continue;
        visitedThisWindow.add(code);
      }
    }

    // Same situations-by-customer narrowing getSummary() does by territory
    // — here keyed directly by CustomerCode (entityKey), one level less of
    // indirection since there's no city grouping step.
    const situationsByCustomer = new Map<string, SgiSituation[]>();
    if (sgiData) {
      for (const s of sgiData.situations) {
        if (s.type === "TARGET_BEHIND" || s.entityType !== "customer") continue;
        const code = s.entityKey.trim();
        if (!byCustomer.has(code)) continue;
        const arr = situationsByCustomer.get(code) ?? [];
        arr.push(s);
        situationsByCustomer.set(code, arr);
      }
    }

    let excludedBadCoordinates = 0;
    const points: TerritoryCustomerPoint[] = [];
    let maxAbsValue = 0;
    const rawByCustomer = new Map<string, number | null>();

    for (const [code, acc] of byCustomer) {
      if (acc.lat === null || acc.lon === null) {
        excludedBadCoordinates++;
        continue;
      }

      const customerSituations = situationsByCustomer.get(code) ?? [];
      const salesGrowthPct = invoicesAvailable ? (acc.prior > 0 ? ((acc.current - acc.prior) / acc.prior) * 100 : null) : null;
      const isActive = invoicesAvailable ? acc.current > 0 : false;
      const isLost = customerSituations.some((s) => s.type === "LOST_SALES");
      const visitCoveragePct = visitsAvailable ? (visitedThisWindow.has(code) ? 100 : 0) : null;
      const collectionHealthPct =
        !collectionsAvailable || !invoicesAvailable || acc.current <= 0 ? null : clamp((acc.collectionCurrent / acc.current) * 100, 0, 100);

      let opportunityValueSar = 0;
      for (const s of customerSituations) {
        if (s.type === "GROWTH_OPPORTUNITY") opportunityValueSar += s.metricValue;
        else if (s.type === "LOST_SALES") opportunityValueSar += s.metricValuePrior ?? 0;
      }

      // Same weighted-average Health Score as getSummary(), fed these
      // single-customer 0-100 components instead of city-aggregated ones.
      const components: Array<{ score: number; weight: number }> = [];
      if (salesGrowthPct !== null) {
        components.push({ score: clamp(salesGrowthPct, -50, 50) + 50, weight: DEFAULT_HEALTH_SCORE_WEIGHTS.salesGrowth });
      }
      components.push({ score: isActive ? 100 : 0, weight: DEFAULT_HEALTH_SCORE_WEIGHTS.activeCustomerRate });
      components.push({ score: isLost ? 0 : 100, weight: DEFAULT_HEALTH_SCORE_WEIGHTS.lostSales });
      if (visitCoveragePct !== null) {
        components.push({ score: visitCoveragePct, weight: DEFAULT_HEALTH_SCORE_WEIGHTS.visitCoverage });
      }
      if (collectionHealthPct !== null) {
        components.push({ score: collectionHealthPct, weight: DEFAULT_HEALTH_SCORE_WEIGHTS.collectionHealth });
      }
      const weightSum = components.reduce((sum, c) => sum + c.weight, 0);
      const healthScore = weightSum > 0 ? clamp(Math.round(components.reduce((sum, c) => sum + c.score * c.weight, 0) / weightSum), 0, 100) : 50;
      const riskLevel = 100 - healthScore;

      let rawValue: number | null;
      switch (metric) {
        case "healthScore":
          rawValue = healthScore;
          break;
        case "salesGrowthPct":
          rawValue = salesGrowthPct;
          break;
        case "lostSalesCount":
          rawValue = isLost ? 1 : 0;
          break;
        case "visitCoveragePct":
          rawValue = visitCoveragePct;
          break;
        case "collectionHealthPct":
          rawValue = collectionHealthPct;
          break;
        case "opportunityValueSar":
          rawValue = opportunityValueSar;
          break;
        case "riskLevel":
          rawValue = riskLevel;
          break;
        default:
          rawValue = null;
      }

      rawByCustomer.set(code, rawValue);
      if (rawValue !== null) maxAbsValue = Math.max(maxAbsValue, Math.abs(rawValue));

      const tier: TerritoryHealthTier =
        healthScore >= 80 ? "excellent" : healthScore >= 60 ? "good" : healthScore >= 40 ? "average" : healthScore >= 20 ? "weak" : "veryWeak";

      points.push({
        customerId: code,
        customerName: acc.name,
        latitude: acc.lat,
        longitude: acc.lon,
        metric,
        rawValue,
        normalizedValue: 0, // filled in below once maxAbsValue is known across all points
        status: tier,
      });
    }

    const safeMax = maxAbsValue > 0 ? maxAbsValue : 1;
    for (const p of points) {
      p.normalizedValue = p.rawValue === null ? 0 : clamp(Math.abs(p.rawValue) / safeMax, 0, 1);
    }

    return {
      metric,
      city: city && city.trim() ? city.trim() : null,
      totalCustomers: customerRecords.length,
      excludedBadCoordinates,
      points,
    };
  }

  async getExecutive(user: AuthenticatedUser): Promise<TerritoryIntelligenceExecutiveResponse> {
    const summary = await this.getSummary(user);
    return this.computeExecutive(summary.territories);
  }

  private computeExecutive(territories: TerritorySummaryItem[]): TerritoryIntelligenceExecutiveResponse {
    const topOpportunities: TerritoryExecutiveItem[] = [...territories]
      .sort((a, b) => b.opportunityValueSar - a.opportunityValueSar)
      .slice(0, 5)
      .map((t) => ({ territoryId: t.id, name: t.name, value: t.opportunityValueSar, reason: t.recommendation }));

    const worstTerritories: TerritoryExecutiveItem[] = [...territories]
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 5)
      .map((t) => ({ territoryId: t.id, name: t.name, value: t.healthScore, reason: t.recommendation }));

    let fastestWin: TerritoryExecutiveItem | null = null;
    const fastestWinCandidates = territories.filter((t) => t.healthScore >= 40);
    if (fastestWinCandidates.length > 0) {
      const best = [...fastestWinCandidates].sort((a, b) => b.opportunityValueSar - a.opportunityValueSar)[0]!;
      fastestWin = {
        territoryId: best.id,
        name: best.name,
        value: best.opportunityValueSar,
        reason: `أسرع مكسب محتمل — ${best.name} بصحة متوسطة أو أفضل وفرصة نمو ${fmt(best.opportunityValueSar)} ريال.`,
      };
    }

    let biggestRisk: TerritoryExecutiveItem | null = null;
    const highSeverityTopped = territories.filter((t) => t.why.length > 0 && t.why[0]!.severity === "high");
    const riskPool = highSeverityTopped.length > 0 ? highSeverityTopped : territories;
    if (riskPool.length > 0) {
      const worst = [...riskPool].sort((a, b) => a.healthScore - b.healthScore)[0]!;
      biggestRisk = { territoryId: worst.id, name: worst.name, value: worst.healthScore, reason: worst.recommendation };
    }

    return {
      topOpportunities,
      worstTerritories,
      fastestWin,
      biggestRisk,
      generatedAt: new Date().toISOString(),
    };
  }
}
