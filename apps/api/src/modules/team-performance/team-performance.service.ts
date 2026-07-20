import { Injectable, NotFoundException } from "@nestjs/common";
import {
  type TeamPerformanceCoachInput,
  type TeamPerformanceCoachResult,
  type TeamPerformanceRepRow,
  type TeamPerformanceRieQueryInput,
  type TeamPerformanceResult,
} from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { retrieveScenarios } from "../assistant/data/scenario-retrieval.util";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
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

interface ResolvedRep {
  repKey: string;
  repName: string;
  repEmail: string;
  supervisorEmail: string | null;
  supervisorName: string | null;
}

interface RepAccumulator {
  repName: string;
  repEmail: string;
  supervisorEmail: string | null;
  supervisorName: string | null;
  sales: number;
  salesPrior: number;
  collection: number;
  collectionPrior: number;
  returns: number;
  returnsPrior: number;
}

// Migration #7 (ADR-001 / RIE Migration Plan) — RIE-backed, no file/column
// mapping. FilesService and PrismaService are no longer dependencies of
// this service (Employees carries names/emails directly, no platform User
// lookup needed).
//
// Three business decisions were reviewed and explicitly approved by the
// Product Owner before this migration (not a mechanical repeat of Migration
// #6's pattern):
//
// 1. Sales = Invoice Items.LineTotal joined to Invoices (RouteID +
//    InvoiceDate), NOT Invoices.TotalAfterVAT directly — kept identical to
//    Heat Map / Customer Comparison's sales source so this screen's numbers
//    stay consistent with the rest of the platform for the same period.
// 2. Supervisor grouping = Employees.DirectManagerID (the formal reporting
//    line), NOT Routes.SupervisorID — Team Performance represents the
//    official management structure, not the operational route structure.
// 3. Each of sales/collection/returns is independent. A category whose
//    Dataset isn't uploaded at all is omitted (fields stay null on every
//    rep row, categoriesAvailable.<category> is false) instead of being
//    zeroed or blocking the other two categories from rendering.
//
// Rep identity: same two-hop join as Migration #6 (Visit Efficiency) —
// RouteID -> Routes.SalesRepID -> Employees. Sales/Collections/Returns all
// carry RouteID directly (Collections/Returns) or via their parent Invoice
// (Invoice Items), so no Visits entity is involved here. Falls back to the
// bare SalesRepID or RouteID when the employee record can't be resolved —
// rows stay usable rather than being silently dropped, same as every other
// migrated screen.
@Injectable()
export class TeamPerformanceService {
  constructor(private readonly rieFacade: RieFacade) {}

  private assertEntityAvailable(result: EntityQueryResult, arabicLabel: string): void {
    if (!result.available) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  // Routes.SalesRepID -> Employees, then Employees.DirectManagerID ->
  // Employees again for the supervisor half (product decision #2). Returns
  // null only when routeId itself is blank; every other gap degrades to a
  // fallback identifier instead of dropping the row.
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
        employeeById.set(id, {
          name: String(emp.EmployeeName ?? id),
          email: String(emp.Email ?? "").trim() || id,
          managerId: managerId || null,
        });
      }
    }

    return (routeId: string): ResolvedRep | null => {
      const trimmedRouteId = routeId.trim();
      if (!trimmedRouteId) return null;

      const salesRepId = routeSalesRep.get(trimmedRouteId);
      if (!salesRepId) {
        return { repKey: trimmedRouteId, repName: trimmedRouteId, repEmail: trimmedRouteId, supervisorEmail: null, supervisorName: null };
      }
      const emp = employeeById.get(salesRepId);
      if (!emp) {
        return { repKey: salesRepId, repName: salesRepId, repEmail: salesRepId, supervisorEmail: null, supervisorName: null };
      }
      const manager = emp.managerId ? employeeById.get(emp.managerId) : undefined;
      return {
        repKey: emp.email,
        repName: emp.name,
        repEmail: emp.email,
        supervisorEmail: manager ? manager.email : null,
        supervisorName: manager ? manager.name : null,
      };
    };
  }

  async query(user: AuthenticatedUser, input: TeamPerformanceRieQueryInput): Promise<TeamPerformanceResult> {
    const ctx = this.rieContext(user);
    const [routesResult, employeesResult, invoicesResult, invoiceItemsResult, collectionsResult, returnsResult] = await Promise.all([
      this.rieFacade.getEntityRecords("Routes", ctx),
      this.rieFacade.getEntityRecords("Employees", ctx),
      this.rieFacade.getEntityRecords("Invoices", ctx),
      this.rieFacade.getEntityRecords("Invoice Items", ctx),
      this.rieFacade.getEntityRecords("Collections", ctx),
      this.rieFacade.getEntityRecords("Returns", ctx),
    ]);
    // Routes/Employees are structural prerequisites for rep identity across
    // the whole platform (same as every migrated screen) — not one of the
    // three independent business categories, so this still hard-fails.
    this.assertEntityAvailable(routesResult, "المسارات");

    const resolveRep = this.buildRepResolver(routesResult, employeesResult);

    // Sales needs both Invoices (RouteID + InvoiceDate) and Invoice Items
    // (LineTotal) for the join — either missing means the category as a
    // whole is unavailable (product decision #3).
    const salesAvailable = invoicesResult.available && invoiceItemsResult.available;
    const collectionAvailable = collectionsResult.available;
    const returnsAvailable = returnsResult.available;

    const fromTime = Date.parse(input.dateFrom);
    const toTime = Date.parse(input.dateTo);
    const hasPrior = !!(input.priorDateFrom && input.priorDateTo);
    const priorFromTime = input.priorDateFrom ? Date.parse(input.priorDateFrom) : null;
    const priorToTime = input.priorDateTo ? Date.parse(input.priorDateTo) : null;

    const acc = new Map<string, RepAccumulator>();
    const getOrCreate = (routeId: string): RepAccumulator | null => {
      const resolved = resolveRep(routeId);
      if (!resolved) return null;
      let entry = acc.get(resolved.repKey);
      if (!entry) {
        entry = {
          repName: resolved.repName,
          repEmail: resolved.repEmail,
          supervisorEmail: resolved.supervisorEmail,
          supervisorName: resolved.supervisorName,
          sales: 0,
          salesPrior: 0,
          collection: 0,
          collectionPrior: 0,
          returns: 0,
          returnsPrior: 0,
        };
        acc.set(resolved.repKey, entry);
      }
      return entry;
    };

    if (salesAvailable) {
      // Invoice Items joined to Invoices for RouteID + InvoiceDate — same
      // join shape as Heat Map/Customer Comparison (REL-CU-002/REL-IN-003),
      // sourcing LineTotal rather than Invoices.TotalAfterVAT (product
      // decision #1).
      const invoiceMeta = new Map<string, { routeId: string; time: number | null }>();
      for (const inv of invoicesResult.records) {
        const no = String(inv.InvoiceNo ?? "").trim();
        const routeId = String(inv.RouteID ?? "").trim();
        if (no && routeId) invoiceMeta.set(no, { routeId, time: toEpochMs(inv.InvoiceDate) });
      }
      for (const item of invoiceItemsResult.records) {
        const invoiceNo = String(item.InvoiceNo ?? "").trim();
        const meta = invoiceMeta.get(invoiceNo);
        if (!meta || meta.time === null) continue;
        const amount = toFiniteNumber(item.LineTotal) ?? 0;
        if (meta.time >= fromTime && meta.time <= toTime) {
          const entry = getOrCreate(meta.routeId);
          if (entry) entry.sales += amount;
        }
        if (hasPrior && priorFromTime !== null && priorToTime !== null && meta.time >= priorFromTime && meta.time <= priorToTime) {
          const entry = getOrCreate(meta.routeId);
          if (entry) entry.salesPrior += amount;
        }
      }
    }

    if (collectionAvailable) {
      for (const row of collectionsResult.records) {
        const routeId = String(row.RouteID ?? "").trim();
        if (!routeId) continue;
        const t = toEpochMs(row.CollectionDate);
        if (t === null) continue;
        const amount = toFiniteNumber(row.Amount) ?? 0;
        if (t >= fromTime && t <= toTime) {
          const entry = getOrCreate(routeId);
          if (entry) entry.collection += amount;
        }
        if (hasPrior && priorFromTime !== null && priorToTime !== null && t >= priorFromTime && t <= priorToTime) {
          const entry = getOrCreate(routeId);
          if (entry) entry.collectionPrior += amount;
        }
      }
    }

    if (returnsAvailable) {
      for (const row of returnsResult.records) {
        const routeId = String(row.RouteID ?? "").trim();
        if (!routeId) continue;
        const t = toEpochMs(row.ReturnDate);
        if (t === null) continue;
        const amount = toFiniteNumber(row.TotalAmount) ?? 0;
        if (t >= fromTime && t <= toTime) {
          const entry = getOrCreate(routeId);
          if (entry) entry.returns += amount;
        }
        if (hasPrior && priorFromTime !== null && priorToTime !== null && t >= priorFromTime && t <= priorToTime) {
          const entry = getOrCreate(routeId);
          if (entry) entry.returnsPrior += amount;
        }
      }
    }

    const reps: TeamPerformanceRepRow[] = Array.from(acc.values()).map((r) => ({
      repEmail: r.repEmail,
      repName: r.repName,
      supervisorEmail: r.supervisorEmail,
      supervisorName: r.supervisorName,
      sales: salesAvailable ? r.sales : null,
      salesPrior: salesAvailable && hasPrior ? r.salesPrior : null,
      collection: collectionAvailable ? r.collection : null,
      collectionPrior: collectionAvailable && hasPrior ? r.collectionPrior : null,
      returns: returnsAvailable ? r.returns : null,
      returnsPrior: returnsAvailable && hasPrior ? r.returnsPrior : null,
    }));
    reps.sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0));

    return {
      reps,
      scopedToOwnTeam: user.roleCode === "SUPERVISOR",
      categoriesAvailable: { sales: salesAvailable, collection: collectionAvailable, returns: returnsAvailable },
    };
  }

  // Rule-based guidance — no LLM call. Unchanged by Migration #7.
  coach(input: TeamPerformanceCoachInput): TeamPerformanceCoachResult {
    const returnRate = input.sales > 0 ? input.returns / input.sales : 0;
    const collectionRate = input.sales > 0 ? input.collection / input.sales : 0;
    const salesTrendPct = input.salesPrior !== null && input.salesPrior > 0 ? (input.sales - input.salesPrior) / input.salesPrior : null;

    let category: "sales_declining" | "returns_high" | "collection_low" | "sales_growing" | "steady" = "steady";
    if (salesTrendPct !== null && salesTrendPct < -0.1) category = "sales_declining";
    else if (returnRate > 0.15) category = "returns_high";
    else if (collectionRate < 0.7 && input.sales > 0) category = "collection_low";
    else if (salesTrendPct !== null && salesTrendPct > 0.1) category = "sales_growing";

    const fallback: Record<typeof category, { note: string; tone: TeamPerformanceCoachResult["tone"]; query: string }> = {
      sales_declining: {
        note: `مبيعات ${input.repName} تراجعت عن الفترة اللي فاتت — كلّمه يعرف السبب قبل ما يتكرر الشهر الجاي.`,
        tone: "attention",
        query: "مبيعات تراجع انخفاض متابعة زيارة",
      },
      returns_high: {
        note: `مرتجعات ${input.repName} أعلى من المعتاد — جرب تسأله ليه قبل ما تتكرر.`,
        tone: "attention",
        query: "مرتجعات مشكلة تكرار جودة",
      },
      collection_low: {
        note: `نسبة تحصيل ${input.repName} منخفضة نسبة للمبيعات — يستاهل متابعة على العملاء المتأخرين.`,
        tone: "attention",
        query: "تحصيل متأخر متابعة عميل مديونية",
      },
      sales_growing: {
        note: `${input.repName} في نمو واضح عن الفترة اللي فاتت — ثبّت نفس الزيارات والنمط.`,
        tone: "positive",
        query: "أداء ممتاز نمو نجاح",
      },
      steady: {
        note: `أداء ${input.repName} مستقر ضمن المعتاد.`,
        tone: "neutral",
        query: "أداء مستقر معتاد",
      },
    };

    const chosen = fallback[category];
    const matches = retrieveScenarios(chosen.query, 1);
    if (matches.length > 0) {
      const scenario = matches[0]!;
      return { note: `${chosen.note} (${scenario.readyPhrase})`, tone: chosen.tone };
    }
    return { note: chosen.note, tone: chosen.tone };
  }
}
