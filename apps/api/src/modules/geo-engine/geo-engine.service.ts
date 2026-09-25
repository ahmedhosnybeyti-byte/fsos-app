import { Injectable, NotFoundException } from "@nestjs/common";
import type { DecisionInsightItem, GeoFilters, GeoQueryInput, GeoQueryResult, GeoTableQueryInput, GeoTableResult, SgiSituation } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { SgiService } from "../sgi/sgi.service";

// Geo Intelligence Engine — Phase 1 backend (Executive Map Redesign Spec,
// 2026-07-22, client-approved). See geo-engine.schemas.ts for the full
// design rationale (module naming, why Country/Region/boundary-polygons are
// deliberately out of scope here, unified-filter-shape parity with Decision
// Analytics Studio).
//
// The Geo Engine consumes KPI-aware, compact PostgreSQL facts through RIE.
// Geo Intelligence is a separate module and is intentionally untouched.

@Injectable()
export class GeoEngineService {
  constructor(
    private readonly rieFacade: RieFacade,
    private readonly sgiService: SgiService,
  ) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
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
    const { fromTime, toTime, priorFromTime, priorToTime } = this.windowFor(input);
    const compiled = this.compileFilters(input);
    const facts = await this.rieFacade.queryGeoEngineMap({
      ...this.rieContext(user), ...input, fromTime, toTime, priorFromTime, priorToTime,
    });
    if ((input.kpi === "sales" || input.kpi === "orders" || input.kpi === "lostSales") && !facts.invoicesAvailable) {
      throw new NotFoundException('بيانات "الفواتير" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.');
    }
    const inScopeCustomers = new Set(facts.scopedCustomerCodes);

    // ---- AI Insight panel (Phase 3): reused from SGI's already-persisted
    // situations, scoped down to whichever customers/reps are in the CURRENT
    // GeoFilters — same block, same reasoning, as decision-analytics-studio
    // .service.ts's query() (3rd/4th independent instance of this exact
    // reuse convention, see that file's own comment). No live LLM call. ----
    const insights = await this.computeInsights(user, inScopeCustomers, compiled);

    return {
      kpi: input.kpi,
      groupBy: input.groupBy,
      points: facts.points,
      maxValue: facts.points.reduce((m, p) => Math.max(m, p.value), 0),
      totalValue: facts.points.reduce((s, p) => s + p.value, 0),
      totalRows: facts.totalRows,
      excludedBadCoordinates: facts.excludedBadCoordinates,
      insights,
      datasetsAvailable: {
        invoices: facts.invoicesAvailable,
        collections: true,
        returns: true,
        visits: true,
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
    inScopeCustomers: ReadonlySet<string>,
    compiled: ReturnType<GeoEngineService["compileFilters"]>,
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

  // Detail Table (Phase 3) — PostgreSQL keeps the invoice-line join, filters,
  // ordering, total count, and requested page together.
  async table(user: AuthenticatedUser, input: GeoTableQueryInput): Promise<GeoTableResult> {
    const { fromTime, toTime, priorFromTime, priorToTime } = this.windowFor(input);
    const facts = await this.rieFacade.queryGeoEngineTable({
      ...this.rieContext(user), ...input, fromTime, toTime, priorFromTime, priorToTime,
    });
    return { rows: facts.rows, page: input.page, pageSize: input.pageSize, totalRows: facts.totalRows };
  }
}
