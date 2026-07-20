import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { SgiLatestResult, SgiRecalculateInput, SgiRecalculateResult, SgiRepDirectoryEntry, SgiSeverity, SgiSituation } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";

// Sales Growth Intelligence (SGI) Phase 1 — the Situation Detection ->
// Opportunity Discovery -> Recommendation -> Opportunity Scoring pipeline
// from docs/SGI_ROADMAP.md.
//
// Migration #8 (ADR-001 / RIE Migration Plan) — RIE-backed sales/collection
// reads, no file/column mapping. FilesService is no longer a dependency of
// this service. Per explicit product decision (Migration #8 scoping): the
// Prisma `Target` model is OUT of scope — TARGET_BEHIND still reads
// `this.prisma.target` exactly as before; only the sales/collection data
// that feeds all five situation types' "actual" side moved to RIE. Rep
// identity: Invoices/Collections carry RouteID directly -> Routes.SalesRepID
// -> Employees (same two-hop join as every migrated screen). Supervisor:
// Employees.DirectManagerID (Migration #7's precedent), resolved directly
// per rep rather than voted per-row, since it's now a 1:1 employee fact
// rather than a manually-typed column that could vary row to row.
type SheetRow = Record<string, unknown>;
const AI_REPORT_TYPE = "sgi_situations";

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

// Prisma's Decimal (decimal.js under the hood) has a documented
// `.toNumber()` — used explicitly rather than relying on implicit
// `Number(decimalInstance)` coercion behavior. Same helper as
// targets.service.ts (duplicated per the module-isolation convention).
function decimalToNumber(value: unknown): number {
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: unknown }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ar-EG");
}

interface CustomerAcc {
  label: string;
  current: number;
  prior: number;
  lastPurchaseMs: number | null;
  collectionCurrent: number;
  repVotes: Map<string, number>;
}

interface RepAcc {
  current: number;
}

interface ResolvedRep {
  repKey: string;
  repEmail: string;
  supervisorEmail: string | null;
}

function getOrCreateCustomer(map: Map<string, CustomerAcc>, key: string, label: string): CustomerAcc {
  let acc = map.get(key);
  if (!acc) {
    acc = { label, current: 0, prior: 0, lastPurchaseMs: null, collectionCurrent: 0, repVotes: new Map() };
    map.set(key, acc);
  } else if (acc.label === key && label !== key) {
    // Upgrade a fallback label (customer code used as its own label because
    // the Customers record couldn't be found) to the real name the first
    // time one shows up for the same customer.
    acc.label = label;
  }
  return acc;
}

function dominantVote(votes: Map<string, number>): string | null {
  let best: string | null = null;
  let bestVotes = 0;
  for (const [candidate, v] of votes) {
    if (v > bestVotes) {
      bestVotes = v;
      best = candidate;
    }
  }
  return best;
}

// The screen's/assistant's/voice's shared conversational opener — generated
// here, at the single source of business intelligence, so no consumer ever
// re-derives or rephrases it independently. Purely templated from
// already-computed fields, same "no invented numbers" rule as everything
// else in this service. Unchanged by Migration #8.
function buildBriefing(summary: SgiRecalculateResult["summary"], situations: SgiSituation[]): string {
  if (situations.length === 0) {
    return "مفيش مواقف محتاجة قرار عندك دلوقتي — كل حاجة تحت السيطرة.";
  }
  const severityRank: Record<SgiSeverity, number> = { high: 0, medium: 1, low: 2 };
  const top = [...situations].sort((a, b) => severityRank[a.severity] - severityRank[b.severity])[0]!;
  const goal = summary.monthlyGoal;
  const goalLine = goal.targetTotal && goal.targetTotal > 0 ? `إنت ماشي بـ${goal.progressPct}% من هدف الشهر. ` : "";
  const countLine = `عندك ${fmt(summary.totalSituations)} موقف محتاج قرار${summary.highSeverityCount > 0 ? ` (${fmt(summary.highSeverityCount)} منهم أولوية عالية)` : ""}. `;
  return `${goalLine}${countLine}أهم حاجة دلوقتي: ${top.title} — ${top.recommendation}`;
}

// The "Opportunity Scoring" step: ranks candidates by their own impact
// magnitude and splits them into thirds (top third = high, middle = medium,
// bottom = low) — relative to this company's own current batch of
// situations. Unchanged by Migration #8.
function assignSeverityByRank<T>(items: T[], impactOf: (item: T) => number): Map<T, SgiSeverity> {
  const sorted = [...items].sort((a, b) => impactOf(b) - impactOf(a));
  const map = new Map<T, SgiSeverity>();
  const n = sorted.length;
  sorted.forEach((item, i) => {
    const severity: SgiSeverity = i < n / 3 ? "high" : i < (2 * n) / 3 ? "medium" : "low";
    map.set(item, severity);
  });
  return map;
}

@Injectable()
export class SgiService {
  constructor(
    private readonly rieFacade: RieFacade,
    private readonly prisma: PrismaService,
  ) {}

  private assertEntityAvailable(result: EntityQueryResult, arabicLabel: string): void {
    if (!result.available) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  private rieContext(companyId: string, requestingUser: { roleCode: string; email: string }) {
    return { companyId, requestingUser };
  }

  // Routes.SalesRepID -> Employees, then Employees.DirectManagerID ->
  // Employees for the supervisor half — identical pattern to
  // team-performance.service.ts's buildRepResolver. Falls back to the bare
  // SalesRepID or RouteID when a hop can't be resolved, so rows stay usable
  // rather than being silently dropped.
  private buildRepResolver(routesResult: EntityQueryResult, employeesResult: EntityQueryResult): (routeId: string) => ResolvedRep | null {
    const routeSalesRep = new Map<string, string>();
    for (const route of routesResult.records) {
      const routeId = String(route.RouteID ?? "").trim();
      const salesRepId = String(route.SalesRepID ?? "").trim();
      if (routeId && salesRepId) routeSalesRep.set(routeId, salesRepId);
    }

    const employeeById = new Map<string, { email: string; managerId: string | null }>();
    if (employeesResult.available) {
      for (const emp of employeesResult.records) {
        const id = String(emp.EmployeeID ?? "").trim();
        if (!id) continue;
        const managerId = String(emp.DirectManagerID ?? "").trim();
        // Lowercased here — the single source all downstream repEmail/
        // ownerRepEmail/repSupervisorMap values derive from — so every
        // later comparison against a lowercased login email (getLatest())
        // or a lowercased Target.repOrTerritoryKey (TARGET_BEHIND) matches
        // regardless of the casing used in the uploaded Employees file.
        employeeById.set(id, { email: (String(emp.Email ?? "").trim() || id).toLowerCase(), managerId: managerId || null });
      }
    }

    return (routeId: string): ResolvedRep | null => {
      const trimmedRouteId = routeId.trim();
      if (!trimmedRouteId) return null;
      const salesRepId = routeSalesRep.get(trimmedRouteId);
      if (!salesRepId) {
        const key = trimmedRouteId.toLowerCase();
        return { repKey: key, repEmail: key, supervisorEmail: null };
      }
      const emp = employeeById.get(salesRepId);
      if (!emp) {
        const key = salesRepId.toLowerCase();
        return { repKey: key, repEmail: key, supervisorEmail: null };
      }
      const manager = emp.managerId ? employeeById.get(emp.managerId) : undefined;
      return { repKey: emp.email, repEmail: emp.email, supervisorEmail: manager ? manager.email : null };
    };
  }

  async recalculate(user: AuthenticatedUser, input: SgiRecalculateInput): Promise<SgiRecalculateResult> {
    if (!user.companyId) throw new ForbiddenException();
    return this.runRecalculation(user.companyId, { roleCode: user.roleCode, email: user.email }, user.userId, input);
  }

  // Cron entry point — computes a freshly-derived "this month so far" vs
  // "previous month" date window and recalculates. Migration #8: RIE has no
  // file/column selection to save and replay, so (unlike the pre-migration
  // version) this no longer depends on a saved per-company config — it
  // simply recomputes. To preserve the exact same "only auto-refresh
  // companies that have engaged with SGI before" behavior the cron always
  // had, it still only sweeps companies with at least one prior situations
  // report (see recalculateAllCompanies), not every company on the
  // platform.
  async recalculateForCompany(companyId: string): Promise<SgiRecalculateResult> {
    const now = new Date();
    const periodMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

    const input: SgiRecalculateInput = {
      periodMonth,
      dateFrom: monthStart.toISOString().slice(0, 10),
      dateTo: now.toISOString().slice(0, 10),
      priorDateFrom: prevMonthStart.toISOString().slice(0, 10),
      priorDateTo: prevMonthEnd.toISOString().slice(0, 10),
    };

    // Unrestricted hierarchy view (equivalent to COMPANY_ADMIN) — a cron run
    // computes the company-wide picture; per-role narrowing still happens on
    // read, in getLatest().
    return this.runRecalculation(companyId, { roleCode: "COMPANY_ADMIN", email: "system@internal" }, null, input);
  }

  // Every company that has ever run a manual recalculate — the cron sweeps
  // exactly this set. Migration #8: keyed off AI_REPORT_TYPE (the situations
  // report) instead of the now-removed sgi_config report, preserving the
  // same selection semantics (a company that never used SGI is silently
  // skipped, not an error).
  async recalculateAllCompanies(): Promise<Array<{ companyId: string; ok: boolean; error?: string }>> {
    const priorRuns = await this.prisma.aiReport.findMany({
      where: { reportType: AI_REPORT_TYPE },
      distinct: ["companyId"],
    });
    const results: Array<{ companyId: string; ok: boolean; error?: string }> = [];
    for (const row of priorRuns) {
      try {
        await this.recalculateForCompany(row.companyId);
        results.push({ companyId: row.companyId, ok: true });
      } catch (err) {
        results.push({ companyId: row.companyId, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return results;
  }

  private async runRecalculation(
    companyId: string,
    hierarchyUser: { roleCode: string; email: string },
    persistUserId: string | null,
    input: SgiRecalculateInput,
  ): Promise<SgiRecalculateResult> {
    const warnings: string[] = [];
    const ctx = this.rieContext(companyId, hierarchyUser);

    const [routesResult, employeesResult, invoicesResult, invoiceItemsResult, customersResult, collectionsResult] = await Promise.all([
      this.rieFacade.getEntityRecords("Routes", ctx),
      this.rieFacade.getEntityRecords("Employees", ctx),
      this.rieFacade.getEntityRecords("Invoices", ctx),
      this.rieFacade.getEntityRecords("Invoice Items", ctx),
      this.rieFacade.getEntityRecords("Customers", ctx),
      this.rieFacade.getEntityRecords("Collections", ctx),
    ]);
    this.assertEntityAvailable(routesResult, "المسارات");
    this.assertEntityAvailable(invoicesResult, "الفواتير");
    this.assertEntityAvailable(invoiceItemsResult, "أصناف الفاتورة");
    this.assertEntityAvailable(customersResult, "العملاء");

    const resolveRep = this.buildRepResolver(routesResult, employeesResult);

    const customerById = new Map<string, SheetRow>();
    for (const c of customersResult.records) {
      const code = String(c.CustomerCode ?? "").trim();
      if (code && !customerById.has(code)) customerById.set(code, c as SheetRow);
    }

    // Invoice Items joined to Invoices for CustomerCode/RouteID/InvoiceDate —
    // same join shape as Heat Map/Team Performance (REL-CU-002/REL-IN-003),
    // sourcing LineTotal as the sales amount (Migration #7's precedent).
    const invoiceMeta = new Map<string, { customerCode: string; routeId: string; time: number | null }>();
    for (const inv of invoicesResult.records) {
      const no = String(inv.InvoiceNo ?? "").trim();
      const customerCode = String(inv.CustomerCode ?? "").trim();
      const routeId = String(inv.RouteID ?? "").trim();
      if (no && customerCode) invoiceMeta.set(no, { customerCode, routeId, time: toEpochMs(inv.InvoiceDate) });
    }

    const fromTime = Date.parse(input.dateFrom);
    const toTime = Date.parse(input.dateTo);
    const priorFromTime = Date.parse(input.priorDateFrom);
    const priorToTime = Date.parse(input.priorDateTo);

    const customers = new Map<string, CustomerAcc>();
    const reps = new Map<string, RepAcc>();
    const repSupervisorMap: Record<string, string> = {};
    let totalActualCurrent = 0;

    for (const item of invoiceItemsResult.records) {
      const invoiceNo = String(item.InvoiceNo ?? "").trim();
      const meta = invoiceMeta.get(invoiceNo);
      if (!meta || meta.time === null) continue; // item's invoice not found — dropped, same as every migrated join
      const customerKey = meta.customerCode;
      if (!customerKey) continue;
      const t = meta.time;
      const amount = toFiniteNumber(item.LineTotal) ?? 0;
      const customerRow = customerById.get(customerKey);
      const label = customerRow ? String(customerRow.CustomerName ?? "").trim() || customerKey : customerKey;

      const resolved = meta.routeId ? resolveRep(meta.routeId) : null;
      const repEmail = resolved?.repEmail ?? "";
      if (resolved?.supervisorEmail) repSupervisorMap[resolved.repEmail] = resolved.supervisorEmail;

      const cAcc = getOrCreateCustomer(customers, customerKey, label);
      if (cAcc.lastPurchaseMs === null || t > cAcc.lastPurchaseMs) cAcc.lastPurchaseMs = t;

      if (t >= fromTime && t <= toTime) {
        cAcc.current += amount;
        totalActualCurrent += amount;
        if (repEmail) {
          cAcc.repVotes.set(repEmail, (cAcc.repVotes.get(repEmail) ?? 0) + 1);
          const rAcc = reps.get(repEmail) ?? { current: 0 };
          rAcc.current += amount;
          reps.set(repEmail, rAcc);
        }
      }
      if (t >= priorFromTime && t <= priorToTime) {
        cAcc.prior += amount;
      }
    }

    // ---- Collections, for COLLECTION_RISK — independent category, same
    // "omitted, never zeroed, never blocks the others" rule Migration #7
    // established for Team Performance's per-category availability.
    if (collectionsResult.available) {
      for (const row of collectionsResult.records) {
        const customerKey = String(row.CustomerCode ?? "").trim();
        if (!customerKey) continue;
        const t = toEpochMs(row.CollectionDate);
        if (t === null || t < fromTime || t > toTime) continue;
        const amount = toFiniteNumber(row.Amount) ?? 0;
        const cAcc = customers.get(customerKey);
        if (cAcc) cAcc.collectionCurrent += amount; // only meaningful for customers seen in Invoices too
      }
    } else {
      warnings.push('بيانات "التحصيل" غير متاحة — تم تخطي موقف "مخاطر التحصيل".');
    }

    const situations: SgiSituation[] = [];

    // ---- TARGET_BEHIND (rep/territory level) — out of Migration #8's
    // scope by explicit product decision: still reads Prisma `Target`
    // unchanged. Only `reps` (the "actual" side, keyed by RIE-resolved
    // rep email) is now RIE-sourced instead of a manually-mapped column.
    const targets = await this.prisma.target.findMany({ where: { companyId, periodMonth: input.periodMonth } });
    if (targets.length === 0) {
      warnings.push(`لا يوجد أهداف مسجلة لشهر ${input.periodMonth} — تم تخطي موقف "متأخر عن الهدف". أضف الأهداف من شاشة الأهداف أولاً.`);
    } else {
      const [y, m] = input.periodMonth.split("-").map(Number) as [number, number];
      const monthStart = Date.UTC(y, m - 1, 1);
      const monthEnd = Date.UTC(y, m, 1);
      const daysInMonth = (monthEnd - monthStart) / 86_400_000;
      const elapsedDays = Math.min(daysInMonth, Math.max(0, (toTime - monthStart) / 86_400_000 + 1));
      const elapsedFraction = daysInMonth > 0 ? elapsedDays / daysInMonth : 1;

      const users = await this.prisma.user.findMany({ where: { companyId } });
      const nameByEmail = new Map(users.map((u) => [u.email.trim().toLowerCase(), u.fullName]));

      const behindCandidates: Array<{ key: string; targetValue: number; actual: number; expected: number; gap: number }> = [];
      for (const target of targets) {
        const key = target.repOrTerritoryKey.trim().toLowerCase();
        const actual = reps.get(key)?.current ?? 0;
        const targetValue = decimalToNumber(target.value);
        const expected = targetValue * elapsedFraction;
        if (expected <= 0) continue;
        const gap = expected - actual;
        if (gap / expected > 0.1) behindCandidates.push({ key, targetValue, actual, expected, gap });
      }
      const severityMap = assignSeverityByRank(behindCandidates, (c) => c.gap);
      for (const c of behindCandidates) {
        const label = nameByEmail.get(c.key) ?? c.key;
        const pctOfTarget = c.targetValue > 0 ? Math.round((c.actual / c.targetValue) * 100) : 0;
        situations.push({
          id: `TARGET_BEHIND:${c.key}:${input.periodMonth}`,
          type: "TARGET_BEHIND",
          severity: severityMap.get(c)!,
          entityType: "rep",
          entityKey: c.key,
          entityLabel: label,
          title: `${label} متأخر عن هدف الشهر`,
          detail: `حقق ${fmt(c.actual)} من هدف ${fmt(c.targetValue)} الشهر ده (${pctOfTarget}%)، والمتوقع تحقيقه لحد النهارده كان ${fmt(c.expected)}.`,
          recommendation: `${label} محتاج يزوّد وتيرة الزيارات والبيع في الأيام الباقية من الشهر عشان يلحق الهدف — راجع معاه خطة الزيارات المتبقية.`,
          metricValue: c.actual,
          metricValuePrior: c.targetValue,
          periodMonth: input.periodMonth,
          ownerRepEmail: c.key,
        });
      }
    }

    // ---- Customer-level situations — unchanged threshold logic, only the
    // accumulator's population source changed above.
    const lostCandidates: Array<{ key: string; acc: CustomerAcc }> = [];
    const decliningCandidates: Array<{ key: string; acc: CustomerAcc }> = [];
    const inactiveCandidates: Array<{ key: string; acc: CustomerAcc }> = [];
    const collectionRiskCandidates: Array<{ key: string; acc: CustomerAcc; uncollected: number }> = [];

    const windowSpanMs = Math.max(toTime - fromTime, 0);
    const inactivityThresholdMs = Math.max(windowSpanMs * 2, 60 * 86_400_000);

    for (const [key, acc] of customers) {
      if (acc.current === 0 && acc.prior > 0) {
        lostCandidates.push({ key, acc });
      } else if (acc.current > 0 && acc.prior > 0 && acc.current < acc.prior * 0.7) {
        decliningCandidates.push({ key, acc });
      } else if (acc.current === 0 && acc.prior === 0 && acc.lastPurchaseMs !== null && toTime - acc.lastPurchaseMs > inactivityThresholdMs) {
        inactiveCandidates.push({ key, acc });
      }
      if (acc.current > 0) {
        const uncollected = acc.current - acc.collectionCurrent;
        const rate = acc.collectionCurrent / acc.current;
        if (rate < 0.5 && uncollected > 0) collectionRiskCandidates.push({ key, acc, uncollected });
      }
    }

    const lostSeverity = assignSeverityByRank(lostCandidates, (c) => c.acc.prior);
    for (const c of lostCandidates) {
      situations.push({
        id: `LOST_SALES:${c.key}:${input.periodMonth}`,
        type: "LOST_SALES",
        severity: lostSeverity.get(c)!,
        entityType: "customer",
        entityKey: c.key,
        entityLabel: c.acc.label,
        title: `${c.acc.label} توقف تمامًا عن الشراء`,
        detail: `كان بيشتري بـ ${fmt(c.acc.prior)} الفترة اللي فاتت ووقف تمامًا الفترة دي.`,
        recommendation: `كلّم ${c.acc.label} فورًا واعرف السبب قبل ما يتحول لمنافس — ده عميل كان نشط لحد وقت قريب.`,
        metricValue: c.acc.current,
        metricValuePrior: c.acc.prior,
        periodMonth: input.periodMonth,
        ownerRepEmail: dominantVote(c.acc.repVotes),
      });
    }

    const decliningSeverity = assignSeverityByRank(decliningCandidates, (c) => c.acc.prior - c.acc.current);
    for (const c of decliningCandidates) {
      const pctDrop = c.acc.prior > 0 ? Math.round(((c.acc.prior - c.acc.current) / c.acc.prior) * 100) : 0;
      situations.push({
        id: `CUSTOMER_DECLINING:${c.key}:${input.periodMonth}`,
        type: "CUSTOMER_DECLINING",
        severity: decliningSeverity.get(c)!,
        entityType: "customer",
        entityKey: c.key,
        entityLabel: c.acc.label,
        title: `${c.acc.label} في تراجع`,
        detail: `مبيعاته نزلت من ${fmt(c.acc.prior)} لـ ${fmt(c.acc.current)} (تراجع ${pctDrop}%).`,
        recommendation: `رتّب زيارة متابعة لـ ${c.acc.label} قبل ما التراجع ده يتحول لعميل خامل تمامًا.`,
        metricValue: c.acc.current,
        metricValuePrior: c.acc.prior,
        periodMonth: input.periodMonth,
        ownerRepEmail: dominantVote(c.acc.repVotes),
      });
    }

    const inactiveSeverity = assignSeverityByRank(inactiveCandidates, (c) => (c.acc.lastPurchaseMs !== null ? toTime - c.acc.lastPurchaseMs : 0));
    for (const c of inactiveCandidates) {
      const days = c.acc.lastPurchaseMs !== null ? Math.round((toTime - c.acc.lastPurchaseMs) / 86_400_000) : null;
      situations.push({
        id: `CUSTOMER_INACTIVE:${c.key}:${input.periodMonth}`,
        type: "CUSTOMER_INACTIVE",
        severity: inactiveSeverity.get(c)!,
        entityType: "customer",
        entityKey: c.key,
        entityLabel: c.acc.label,
        title: `${c.acc.label} عميل خامل`,
        detail: days !== null ? `مفيش نشاط ليه من فترة — آخر شراء كان قبل ${days} يوم تقريبًا.` : `مفيش نشاط مسجل ليه في الفترتين.`,
        recommendation: `رشّح ${c.acc.label} لزيارة إعادة تنشيط أو راجع سبب توقفه الكامل قبل شطبه من خطة الزيارات.`,
        metricValue: c.acc.current,
        metricValuePrior: c.acc.prior,
        periodMonth: input.periodMonth,
        ownerRepEmail: dominantVote(c.acc.repVotes),
      });
    }

    const collectionSeverity = assignSeverityByRank(collectionRiskCandidates, (c) => c.uncollected);
    for (const c of collectionRiskCandidates) {
      const rate = c.acc.current > 0 ? Math.round((c.acc.collectionCurrent / c.acc.current) * 100) : 0;
      situations.push({
        id: `COLLECTION_RISK:${c.key}:${input.periodMonth}`,
        type: "COLLECTION_RISK",
        severity: collectionSeverity.get(c)!,
        entityType: "customer",
        entityKey: c.key,
        entityLabel: c.acc.label,
        title: `${c.acc.label} فيه مبلغ معلّق`,
        detail: `اشترى بـ ${fmt(c.acc.current)} وحصّل منه بس ${fmt(c.acc.collectionCurrent)} (نسبة تحصيل ${rate}%).`,
        recommendation: `تابع تحصيل ${fmt(c.uncollected)} من ${c.acc.label} قبل ما المبلغ المعلّق يتراكم أكتر.`,
        metricValue: c.acc.collectionCurrent,
        metricValuePrior: c.acc.current,
        periodMonth: input.periodMonth,
        ownerRepEmail: dominantVote(c.acc.repVotes),
      });
    }

    const targetTotalAgg = await this.prisma.target.aggregate({ where: { companyId, periodMonth: input.periodMonth }, _sum: { value: true } });
    const targetTotalNum = targetTotalAgg._sum.value ? decimalToNumber(targetTotalAgg._sum.value) : null;

    const summary: SgiRecalculateResult["summary"] = {
      totalSituations: situations.length,
      highSeverityCount: situations.filter((s) => s.severity === "high").length,
      monthlyGoal: {
        targetTotal: targetTotalNum,
        actualTotal: totalActualCurrent,
        progressPct: targetTotalNum && targetTotalNum > 0 ? Math.round((totalActualCurrent / targetTotalNum) * 100) : null,
      },
    };

    const result: SgiRecalculateResult = {
      generatedAt: new Date().toISOString(),
      periodMonth: input.periodMonth,
      situations,
      repSupervisorMap,
      warnings,
      summary,
      // Unfiltered (company-wide) briefing — this is what a COMPANY_ADMIN/
      // MANAGER sees immediately after a manual recalculate. getLatest()
      // below regenerates it per-viewer against their own filtered
      // situations, so a rep's copy leads with their own top item.
      briefing: buildBriefing(summary, situations),
    };

    // Migration #8: no fileId anymore (RIE has no source file) — AiReport.
    // fileId is nullable, so this is a straightforward drop, not a schema
    // change.
    await this.prisma.aiReport.create({
      data: {
        companyId,
        userId: persistUserId,
        reportType: AI_REPORT_TYPE,
        content: result as unknown as object,
      },
    });

    return result;
  }

  // Returns the most recently persisted recalculation, narrowed to the
  // requesting user's own visibility (SALES_REP: their own situations only;
  // SUPERVISOR: their team's; everyone else: unfiltered) — using the
  // repSupervisorMap captured at recalculation time. Unchanged by
  // Migration #8 — this method never touched Sales/Collection files
  // directly.
  async getLatest(user: AuthenticatedUser): Promise<SgiLatestResult | null> {
    if (!user.companyId) throw new ForbiddenException();
    const companyId = user.companyId;

    const row = await this.prisma.aiReport.findFirst({
      where: { companyId, reportType: AI_REPORT_TYPE },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;

    const content = row.content as unknown as SgiRecalculateResult;
    const scopedToOwnTeam = user.roleCode === "SUPERVISOR" || user.roleCode === "SALES_REP";

    let situations = content.situations;
    if (user.roleCode === "SALES_REP") {
      const email = user.email.trim().toLowerCase();
      situations = situations.filter((s) => s.ownerRepEmail === email);
    } else if (user.roleCode === "SUPERVISOR") {
      const email = user.email.trim().toLowerCase();
      const myReps = new Set(
        Object.entries(content.repSupervisorMap ?? {})
          .filter(([, sup]) => sup === email)
          .map(([rep]) => rep),
      );
      situations = situations.filter((s) => s.ownerRepEmail !== null && myReps.has(s.ownerRepEmail));
    }

    const repEmails = Array.from(new Set(situations.map((s) => s.ownerRepEmail).filter((e): e is string => e !== null)));
    let repDirectory: SgiRepDirectoryEntry[] = [];
    if (repEmails.length > 0) {
      const users = await this.prisma.user.findMany({ where: { companyId } });
      const nameByEmail = new Map(users.map((u) => [u.email.trim().toLowerCase(), u.fullName]));
      repDirectory = repEmails.map((email) => {
        const supervisorEmail = content.repSupervisorMap?.[email] ?? null;
        return {
          email,
          name: nameByEmail.get(email) ?? email,
          supervisorEmail,
          supervisorName: supervisorEmail ? (nameByEmail.get(supervisorEmail) ?? supervisorEmail) : null,
        };
      });
    }

    return {
      generatedAt: content.generatedAt,
      periodMonth: content.periodMonth,
      situations,
      warnings: content.warnings ?? [],
      summary: content.summary,
      briefing: buildBriefing(content.summary, situations),
      repDirectory,
      scopedToOwnTeam,
    };
  }
}
