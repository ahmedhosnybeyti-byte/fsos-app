import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PrismaService } from "../../common/prisma";
import { RieFacade } from "../rie/rie-facade.service";

const DAY = 86_400_000;
const TARGETS = [
  ["SalesTarget", "هدف المبيعات", "sales", true, "currency"], ["CollectionTarget", "هدف التحصيل", "collections", true, "currency"],
  ["WeightTarget", "هدف الوزن", "weight", false, "weight"], ["ActiveCustomersTarget", "هدف العملاء النشطين", "customers", false, "count"],
  ["ProductiveCallsTarget", "هدف الزيارات المنتجة", "productiveCalls", false, "count"], ["SKUDistributionTarget", "هدف توزيع الأصناف", "skus", false, "count"],
] as const;
type DashboardBenchmark = "previous-month" | "previous-quarter-average";
function number(v: unknown) { if (typeof v === "number") return Number.isFinite(v) ? v : null; if (typeof v === "string" && v.trim()) { const n = Number(v.replace(/,/g, "")); return Number.isFinite(n) ? n : null; } return null; }
function time(v: unknown) { if (v instanceof Date) return v.getTime(); if (typeof v === "string" || typeof v === "number") { const t = Date.parse(String(v)); return Number.isNaN(t) ? null : t; } return null; }
function key(t: number) { return new Date(t).toISOString().slice(0, 10); }
function monthStart(d: Date, delta = 0) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)); }

@Injectable()
export class DashboardPerformanceService {
  constructor(private readonly rie: RieFacade, private readonly prisma: PrismaService) {}
  private ctx(user: AuthenticatedUser) { return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } }; }

  async get(user: AuthenticatedUser, benchmark: DashboardBenchmark, routeIds?: string[], dateFrom?: string, dateTo?: string, comparisonFrom?: string, comparisonTo?: string) {
    const now = new Date(); const currentFrom = dateFrom ? new Date(`${dateFrom}T00:00:00Z`) : monthStart(now); const currentTo = dateTo ? new Date(`${dateTo}T23:59:59Z`) : now; const comparisonStart = comparisonFrom ? new Date(`${comparisonFrom}T00:00:00Z`) : null; const comparisonEnd = comparisonTo ? new Date(`${comparisonTo}T23:59:59Z`) : null; const start = monthStart(currentFrom); const next = monthStart(currentTo, 1); const ctx = this.ctx(user); const selectedRoutes = routeIds?.length ? new Set(routeIds) : null;
    const [calendar, invoices, items, collections, returns, visits, products, targets] = await Promise.all([
      this.prisma.salesCalendar.findMany({ where: { companyId: user.companyId!, calendarDate: { gte: start, lt: next }, workingDay: true }, orderBy: { calendarDate: "asc" } }),
      this.rie.getEntityRecords("Invoices", ctx), this.rie.getEntityRecords("Invoice Items", ctx), this.rie.getEntityRecords("Collections", ctx), this.rie.getEntityRecords("Returns", ctx), this.rie.getEntityRecords("Visits", ctx), this.rie.getEntityRecords("Products", ctx), this.rie.getEntityRecords("Targets", ctx),
    ]);
    const selling = calendar.map((d) => d.calendarDate.getTime()).filter((d) => d >= currentFrom.getTime() && d <= currentTo.getTime());
    const elapsed = selling.length; const total = calendar.length; const warnings: string[] = [];
    if (!total) warnings.push("لا توجد أيام بيع مفعّلة للشهر الحالي في تقويم المبيعات.");
    const range = (dates: number[]) => new Set(dates.map(key));
    const currentDates = range(selling);
    const priorMonthDates = await this.firstSellingDates(user.companyId!, monthStart(currentFrom, -1), elapsed);
    // Custom comparison deliberately reuses Dashboard's `firstSellingDates`
    // helper: each selected month is compared on the same MTD selling-day
    // count as the current period, then averages are calculated below.
    // It must never sum Jan–Mar as one long reference window.
    const customMonths = comparisonStart && comparisonEnd
      ? await Promise.all(Array.from({ length: (comparisonEnd.getUTCFullYear() - comparisonStart.getUTCFullYear()) * 12 + comparisonEnd.getUTCMonth() - comparisonStart.getUTCMonth() + 1 }, (_, index) => {
          const month = new Date(Date.UTC(comparisonStart.getUTCFullYear(), comparisonStart.getUTCMonth() + index, 1));
          return this.firstSellingDates(user.companyId!, month, elapsed);
        }))
      : null;
    const quarterDates = customMonths?.length ? customMonths : benchmark === "previous-quarter-average" ? await this.previousQuarterDates(user.companyId!, currentFrom, elapsed) : [priorMonthDates];
    const invoiceByNo = new Map<string, { date: string; customer: string; routeId: string }>();
    if (invoices.available) for (const r of invoices.records) { const id = String(r.InvoiceNo ?? "").trim(); const t = time(r.InvoiceDate); if (id && t !== null) invoiceByNo.set(id, { date: key(t), customer: String(r.CustomerCode ?? "").trim(), routeId: String(r.RouteID ?? "").trim() }); }
    const productWeight = new Map<string, number>(); if (products.available) for (const p of products.records) { const id = String(p.ProductCode ?? "").trim(); const w = number(p.Weight ?? p.UnitWeight); if (id && w !== null) productWeight.set(id, w); }
    type Acc = { sales: number; invoices: Set<string>; customers: Set<string>; skus: Set<string>; weight: number; collections: number | null; returns: number | null; productiveCalls: number | null; daily: { sales: Map<string, number>; collections: Map<string, number>; returns: Map<string, number>; invoices: Map<string, Set<string>>; customers: Map<string, Set<string>>; skus: Map<string, Set<string>> } };
    const calculate = (dates: Set<string>): Acc => {
      const a: Acc = { sales: 0, invoices: new Set(), customers: new Set(), skus: new Set(), weight: 0, collections: collections.available ? 0 : null, returns: returns.available ? 0 : null, productiveCalls: visits.available ? 0 : null, daily: { sales: new Map(), collections: new Map(), returns: new Map(), invoices: new Map(), customers: new Map(), skus: new Map() } };
      if (items.available) for (const r of items.records) { const inv = invoiceByNo.get(String(r.InvoiceNo ?? "").trim()); if (!inv || !dates.has(inv.date) || (selectedRoutes && !selectedRoutes.has(inv.routeId))) continue; const invoiceNo = String(r.InvoiceNo); const amount = number(r.LineTotal) ?? 0; a.sales += amount; a.invoices.add(invoiceNo); if (inv.customer) a.customers.add(inv.customer); const sku = String(r.ProductCode ?? "").trim(); if (sku) a.skus.add(sku); const qty = number(r.Quantity) ?? 0; a.weight += qty * (productWeight.get(sku) ?? 0); a.daily.sales.set(inv.date, (a.daily.sales.get(inv.date) ?? 0) + amount); const dailyInvoices = a.daily.invoices.get(inv.date) ?? new Set<string>(); dailyInvoices.add(invoiceNo); a.daily.invoices.set(inv.date, dailyInvoices); const dailyCustomers = a.daily.customers.get(inv.date) ?? new Set<string>(); if (inv.customer) dailyCustomers.add(inv.customer); a.daily.customers.set(inv.date, dailyCustomers); const dailySkus = a.daily.skus.get(inv.date) ?? new Set<string>(); if (sku) dailySkus.add(sku); a.daily.skus.set(inv.date, dailySkus); }
      if (collections.available) for (const r of collections.records) { const t = time(r.CollectionDate); if (t !== null && dates.has(key(t)) && (!selectedRoutes || selectedRoutes.has(String(r.RouteID ?? "").trim()))) { const date = key(t); const amount = number(r.Amount) ?? 0; a.collections! += amount; a.daily.collections.set(date, (a.daily.collections.get(date) ?? 0) + amount); } }
      if (returns.available) for (const r of returns.records) { const t = time(r.ReturnDate); if (t !== null && dates.has(key(t)) && (!selectedRoutes || selectedRoutes.has(String(r.RouteID ?? "").trim()))) { const date = key(t); const amount = number(r.TotalAmount) ?? 0; a.returns! += amount; a.daily.returns.set(date, (a.daily.returns.get(date) ?? 0) + amount); } }
      if (visits.available) for (const r of visits.records) { const t = time(r.VisitDate); const status = String(r.Status ?? r.VisitStatus ?? "").toLowerCase(); if (t !== null && dates.has(key(t)) && (status === "productive" || status === "منتجة")) a.productiveCalls!++; }
      return a;
    };
    const cur = calculate(currentDates); const benchmarks = quarterDates.map((d) => calculate(d));
    const avg = (get: (a: Acc) => number | null) => { const values = benchmarks.map(get).filter((v): v is number => v !== null); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };
    const metric = (value: number | null, previous: number | null, sparkline: number[]) => ({ current: value, benchmark: previous, growthPct: value !== null && previous !== null && previous !== 0 ? ((value - previous) / previous) * 100 : null, sparkline });
    const dailyValues = (get: (date: string) => number) => selling.map((d) => get(key(d)));
    const salesAvailable = invoices.available && items.available;
    const actual: Record<string, number | null> = { sales: salesAvailable ? cur.sales : null, collections: cur.collections, weight: salesAvailable && productWeight.size ? cur.weight : null, customers: salesAvailable ? cur.customers.size : null, productiveCalls: cur.productiveCalls, skus: salesAvailable ? cur.skus.size : null };
    const targetCards = targets.available ? TARGETS.map(([field, label, actualKey, primary, unit]) => { const monthlyTarget = targets.records.filter((r) => number(r.Year) === currentTo.getUTCFullYear() && number(r.Month) === currentTo.getUTCMonth() + 1 && (!selectedRoutes || selectedRoutes.has(String(r.RouteID ?? "").trim()))).reduce((sum, r) => sum + (number(r[field]) ?? 0), 0); if (!monthlyTarget) return null; const value = actual[actualKey] ?? null; const targetMtd = total ? monthlyTarget * elapsed / total : 0; const remaining = value === null ? null : Math.max(monthlyTarget - value, 0); return { key: field, label, monthlyTarget, actualMtd: value, targetMtd, aheadBehind: value === null ? null : value - targetMtd, progressPct: value === null || !targetMtd ? null : value / targetMtd * 100, remainingMonthlyTarget: remaining, requiredDailyVelocity: remaining === null || total - elapsed <= 0 ? null : remaining / (total - elapsed), runRateForecast: value === null || !elapsed ? null : value / elapsed * total, primary, unit } }).filter((v): v is NonNullable<typeof v> => v !== null) : [];
    const priority = ["SalesTarget", "CollectionTarget", "ProductiveCallsTarget", "ActiveCustomersTarget", "SKUDistributionTarget", "WeightTarget"];
    const hasHigherSecondary = targetCards.some((target) => !target.primary && target.key !== "WeightTarget");
    const orderedTargets = targetCards.filter((target) => target.key !== "WeightTarget" || !hasHigherSecondary).sort((a, b) => priority.indexOf(a.key) - priority.indexOf(b.key));
    return { periodMonth: key(start.getTime()).slice(0, 7), benchmark, sellingDays: { elapsed, total, remaining: Math.max(total - elapsed, 0), available: total > 0 }, metrics: { sales: metric(salesAvailable ? cur.sales : null, salesAvailable ? avg((a) => a.sales) : null, salesAvailable ? dailyValues((date) => cur.daily.sales.get(date) ?? 0) : []), collections: metric(cur.collections, avg((a) => a.collections), collections.available ? dailyValues((date) => cur.daily.collections.get(date) ?? 0) : []), invoices: metric(salesAvailable ? cur.invoices.size : null, salesAvailable ? avg((a) => a.invoices.size) : null, salesAvailable ? dailyValues((date) => cur.daily.invoices.get(date)?.size ?? 0) : []), customers: metric(salesAvailable ? cur.customers.size : null, salesAvailable ? avg((a) => a.customers.size) : null, salesAvailable ? dailyValues((date) => cur.daily.customers.get(date)?.size ?? 0) : []), skus: metric(salesAvailable ? cur.skus.size : null, salesAvailable ? avg((a) => a.skus.size) : null, salesAvailable ? dailyValues((date) => cur.daily.skus.get(date)?.size ?? 0) : []), returns: metric(cur.returns, avg((a) => a.returns), returns.available ? dailyValues((date) => cur.daily.returns.get(date) ?? 0) : []) }, targets: orderedTargets, warnings };
  }
  private async firstSellingDates(companyId: string, start: Date, count: number) { const end = monthStart(start, 1); const days = await this.prisma.salesCalendar.findMany({ where: { companyId, calendarDate: { gte: start, lt: end }, workingDay: true }, orderBy: { calendarDate: "asc" } }); return new Set(days.slice(0, count).map((d) => key(d.calendarDate.getTime()))); }
  private async previousQuarterDates(companyId: string, now: Date, count: number) { return Promise.all([1, 2, 3].map((i) => this.firstSellingDates(companyId, monthStart(now, -i), count))); }
}
