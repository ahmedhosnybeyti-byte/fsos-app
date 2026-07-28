import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  resolveVisitCopilotPeriod,
  VISIT_COPILOT_LIMITS,
  type SgiSituation,
  type VisitCopilot360Summary,
  type VisitCopilotBriefingQuery,
  type VisitCopilotChatRequest,
  type VisitCopilotDailyBriefQuery,
  type VisitCopilotDaily360SummaryQuery,
  type VisitCopilotDiscoveryQuery,
  type VisitCopilotGoogleSearchRequest,
  type VisitCopilotPeriod,
  type VisitCopilotPeriodRange,
  type VisitCopilotPlanRequest,
  type VisitCopilotProspectStatusRequest,
} from "@field-sales-os/schemas";
import type { Prospect } from "@field-sales-os/database";
import { AppConfigService } from "../../common/config/app-config.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityRecord } from "../rie/entity-provider.interface";
import { haversineKm, type LatLon } from "../route-planning/route-balancer.util";
import { decryptCredentials } from "../data-sources/credential-cipher.util";
import { categoryForChannel, type ProspectDiscoveryProvider } from "./discovery/discovery-provider.interface";
import { GooglePlacesProvider } from "./discovery/google-places.provider";
import { OverpassProvider } from "./discovery/overpass.provider";
import { resolveMentionedCustomer } from "../local-decision/dictionary-engine";
import { LocalDecisionEngine } from "../local-decision/rule-engine";
import { VisitCopilotRuleRegistry } from "./visit-copilot.rules";
import { SgiService } from "../sgi/sgi.service";

// AI Visit Copilot — Phase 1. Decision-support screen for the field rep:
// today's visit plan + a per-customer pre-visit briefing that must be
// scannable in under 10 seconds (numbers + one top opportunity + one
// suggested visit goal + concrete actions), plus a scoped Claude chat.
//
// Every read goes through RieFacade.getEntityRecords with requestingUser —
// Hierarchy Row-Level Filtering (rep sees only own routes) happens inside
// the provider, same as assistant.service.ts / route-planning.service.ts.
// briefing/topOpportunity/suggestedGoal/actions are RULE-BASED Arabic
// strings computed here (instant, no model call); only POST /chat talks to
// Claude, reusing the exact same client approach + ANTHROPIC_API_KEY config
// as assistant.service.ts (no new env var).

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const CHAT_MAX_TOKENS = 700;
const AVERAGE_SPEED_KMH = 30;
const MINUTES_PER_VISIT = 15;
const FALLBACK_WORKING_DAYS_PER_MONTH = 26;
const TOP_PRODUCTS_LIMIT = 5;
const MISSING_PRODUCTS_LIMIT = 5;
// "ملخص اليوم 360°" — the one bounded AI call gets a hard timeout; on abort
// (or any other failure) buildDaily360Narrative falls back to the
// deterministic template, per explicit product requirement.
const DAILY_360_AI_TIMEOUT_MS = 12_000;

function fmtNum(n: number): string {
  return new Intl.NumberFormat("ar-EG").format(Math.round(n));
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// Customer Discovery — Phase 2 constants.
// Discovered places this close to an existing customer ARE that customer.
const EXISTING_CUSTOMER_RADIUS_KM = 0.1;
// Route-opportunity card only suggests prospects near today's territory.
const ROUTE_OPPORTUNITY_RADIUS_KM = 5;
// Proximity component of successProbability decays linearly to 0 here.
const PROXIMITY_DECAY_KM = 10;
const ROUTE_OPPORTUNITY_HIGH_SCORE = 70;
const ROUTE_OPPORTUNITY_MEDIUM_SCORE = 40;
const BEST_OPPORTUNITIES_LIMIT = 2;

// Loose channel equality — real data mixes labels ("TT" vs "Traditional
// Trade"), so equal-or-substring either way, case-insensitive.
function channelsLooselyMatch(a: string, b: string): boolean {
  const la = a.trim().toLowerCase();
  const lb = b.trim().toLowerCase();
  if (la === "" || lb === "") return false;
  return la === lb || la.includes(lb) || lb.includes(la);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type ClaudeTextBlock = { type: string; text?: string };

interface PeriodInput {
  period: VisitCopilotPeriod;
  from?: string;
  to?: string;
}

export interface DailyBriefCustomer {
  customerCode: string;
  customerName: string;
  lat: number | null;
  lon: number | null;
  visitSequence: number | null;
  channel: string | null;
  avgOrderValue: number;
  lastVisitDate: string | null;
  priorityScore: number;
}

export interface DailyBriefResult {
  date: string;
  weekday: string;
  isWorkingDay: boolean;
  visitCount: number;
  dailyTargetSales: number | null;
  expectedSalesTotal: number;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  customers: DailyBriefCustomer[];
  warnings: string[];
}

export interface BriefingProduct {
  productCode: string;
  productName: string;
  qty: number;
  value: number;
}

export interface BriefingMissingProduct {
  productCode: string;
  productName: string;
  reason: string;
}

export interface CustomerBriefingResult {
  customerCode: string;
  customerName: string;
  period: VisitCopilotPeriodRange;
  sales: { total: number; invoiceCount: number; trendPct: number | null };
  returns: { total: number; rate: number | null };
  collections: { collected: number; pending: number; bounced: number; oldestPendingDueDate: string | null };
  topProducts: BriefingProduct[];
  missingProducts: BriefingMissingProduct[];
  topOpportunity: string;
  suggestedGoal: string;
  actions: string[];
  warnings: string[];
}

// Customer Discovery — Phase 2 result shapes.
export interface DiscoveryCustomer {
  customerCode: string;
  name: string;
  lat: number;
  lon: number;
  channel: string | null;
  status: "existing";
}

export interface ScoredProspect {
  id: string;
  source: string;
  name: string;
  lat: number | null;
  lon: number | null;
  channel: string | null;
  status: string;
  priorityScore: number;
  expectedOrderValue: number;
  successProbability: number;
  reason: string;
  distanceKm: number | null;
}

export interface DiscoveryResult {
  customers: DiscoveryCustomer[];
  prospects: ScoredProspect[];
  repChannel: string | null;
  warnings: string[];
}

export interface GoogleSearchResult {
  found: number;
  newCount: number;
  prospects: ScoredProspect[];
  warnings: string[];
  disabled?: boolean;
  message?: string;
}

export interface RouteOpportunityBest {
  id: string;
  name: string;
  expectedOrderValue: number;
  addedMinutes: number;
  addedKm: number;
}

export interface RouteOpportunitiesResult {
  highCount: number;
  mediumCount: number;
  best: RouteOpportunityBest[];
  totalExpectedValue: number;
  disabled: boolean;
  warnings: string[];
}

// Same wire shape as CustomerBriefingResult so the frontend briefing screen
// renders it unchanged — only isProspect flags the mode.
export interface ProspectBriefingResult extends CustomerBriefingResult {
  isProspect: true;
}

// POST /visit-copilot/chat result. activeCustomerCode/Name are present only
// when the Local Decision Layer resolved a customer mentioned in the
// message text that differs from the one the request was scoped to —
// backward compatible (optional) for any caller still reading just `reply`.
export interface VisitCopilotChatResult {
  reply: string;
  source: "local" | "ai";
  activeCustomerCode?: string;
  activeCustomerName?: string;
}

// "ملخص اليوم 360°" — every already-computed fact the narrative layer
// (buildTemplateNarrative / buildDaily360Narrative) is allowed to draw on.
// Deliberately a superset of VisitCopilot360Summary's own fields (adds
// highSeverityCount/topIssueSituation as narrative-only inputs that don't
// themselves appear verbatim on the wire DTO).
interface Daily360Facts {
  generatedAt: string;
  reportDate: string;
  period: VisitCopilotPeriodRange;
  scopeLabel: string;
  userName: string;
  roleLabel: string;
  goal: VisitCopilot360Summary["goal"];
  sales: VisitCopilot360Summary["sales"];
  lostOpportunities: VisitCopilot360Summary["lostOpportunities"];
  collections: VisitCopilot360Summary["collections"];
  returns: VisitCopilot360Summary["returns"];
  interventionNeeded: VisitCopilot360Summary["interventionNeeded"];
  warnings: string[];
  highSeverityCount: number;
  topIssueSituation: SgiSituation | null;
}

interface Daily360Narrative {
  source: "ai" | "template";
  executiveSummary: string;
  topIssue: string | null;
  rootCauses: VisitCopilot360Summary["rootCauses"];
  executiveDecision: string;
  executionPlan: VisitCopilot360Summary["executionPlan"];
  closingPhrase: string;
}

// Internal per-request stats shared by every discovery computation.
interface DiscoveryStats {
  range: VisitCopilotPeriodRange;
  customers: {
    customerCode: string;
    name: string;
    lat: number | null;
    lon: number | null;
    channel: string | null;
    invoiceCount: number;
    avgOrderValue: number;
  }[];
  repChannel: string | null;
  centroid: LatLon | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Same sane-coordinate guard as route-planning.service.ts — real uploads
// have shown occasional lat=0/lon=0 garbage rows.
function isSaneCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

// Dataset date cells may arrive as Date (cellDates:true), ISO-ish strings,
// or (rarely) raw Excel serial numbers — be tolerant of all three.
function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000); // Excel serial day
    return null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const d = new Date(value.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoDayOf(value: unknown): string | null {
  const d = parseDate(value);
  return d ? isoDay(d) : null;
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "y" || s === "نعم" || s === "working";
}

function daysBetween(fromIso: string, toIso: string): number {
  const diff = (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : 0;
}

function matchesMonth(raw: unknown, month: number): boolean {
  const asNumber = toFiniteNumber(raw);
  if (asNumber !== null) return asNumber === month;
  const s = String(raw ?? "").trim().toLowerCase();
  return s !== "" && MONTH_NAMES[month - 1] === s;
}

// min-max normalization to [0..1]; a flat set (max === min) scores 0.5 so a
// single-signal blend still produces a mid-range, comparable score.
function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return (value - min) / (max - min);
}

@Injectable()
export class VisitCopilotService {
  constructor(
    private readonly rieFacade: RieFacade,
    private readonly appConfig: AppConfigService,
    // Prospects are materialized Postgres state (statuses are live field
    // data) — the one Visit Copilot read that does NOT go through RIE.
    private readonly prisma: PrismaService,
    // "ملخص اليوم 360°" (2026-07-28): sole facts/numbers source, already
    // hierarchy-scoped per viewer — see daily360Summary() below.
    private readonly sgiService: SgiService,
  ) {}

  // Every RIE read must pass requestingUser — Hierarchy Row-Level Filtering
  // is applied inside RieFacade.getEntityRecords itself (see the identical
  // helper in assistant.service.ts / route-planning.service.ts).
  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  // Graceful degradation for every entity except Customers: unavailable or
  // erroring reads become a warning string + empty rows, never a 500.
  private async tryEntity(ctx: ReturnType<VisitCopilotService["rieContext"]>, entityName: string, arabicLabel: string, warnings: string[]): Promise<readonly EntityRecord[]> {
    try {
      const result = await this.rieFacade.getEntityRecords(entityName, ctx);
      if (!result.available) {
        warnings.push(`بيانات "${arabicLabel}" غير متاحة — بعض الأرقام قد تكون ناقصة.`);
        return [];
      }
      return result.records;
    } catch {
      warnings.push(`تعذر قراءة بيانات "${arabicLabel}" — بعض الأرقام قد تكون ناقصة.`);
      return [];
    }
  }

  // Customers is the plan basis — without it nothing on this screen makes
  // sense, so (only) this one is a hard error, same style as route-planning.
  private async requireCustomers(ctx: ReturnType<VisitCopilotService["rieContext"]>): Promise<readonly EntityRecord[]> {
    const result = await this.rieFacade.getEntityRecords("Customers", ctx);
    if (!result.available) {
      throw new NotFoundException('بيانات "العملاء" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.');
    }
    return result.records;
  }

  // ------------------------------------------------------------------
  // 1) GET /visit-copilot/daily-brief
  // ------------------------------------------------------------------

  async dailyBrief(user: AuthenticatedUser, query: VisitCopilotDailyBriefQuery): Promise<DailyBriefResult> {
    return this.buildDailyBrief(user, query);
  }

  private async buildDailyBrief(user: AuthenticatedUser, periodInput: PeriodInput): Promise<DailyBriefResult> {
    const ctx = this.rieContext(user);
    const range = resolveVisitCopilotPeriod(periodInput);
    const warnings: string[] = [];

    const [customers, invoices, items, collections, targets, calendar, visits] = await Promise.all([
      this.requireCustomers(ctx),
      this.tryEntity(ctx, "Invoices", "الفواتير", warnings),
      this.tryEntity(ctx, "Invoice Items", "أصناف الفاتورة", warnings),
      this.tryEntity(ctx, "Collections", "التحصيلات", warnings),
      this.tryEntity(ctx, "Targets", "الأهداف", warnings),
      this.tryEntity(ctx, "Sales Calendar", "تقويم المبيعات", warnings),
      this.tryEntity(ctx, "Visits", "الزيارات", warnings),
    ]);

    const now = new Date();
    const todayIso = isoDay(now);
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(now);

    // Working day check from Sales Calendar (if present) — a non-working
    // day still returns the list, just flagged.
    let isWorkingDay = true;
    const todayCalendarRow = calendar.find((row) => isoDayOf(row.CalendarDate) === todayIso);
    if (todayCalendarRow) isWorkingDay = isTruthyFlag(todayCalendarRow.WorkingDay);

    // Today's plan basis: customers whose VisitDay is today's weekday.
    const weekdayLower = weekday.toLowerCase();
    const todayCustomers = customers.filter((row) => String(row.VisitDay ?? "").trim().toLowerCase() === weekdayLower);

    // Invoice metadata over ALL invoices (recency gap uses the true last
    // invoice date, not just the analysis period).
    const invoiceMeta = new Map<string, { customerCode: string; dateIso: string | null }>();
    const lastInvoiceIsoByCustomer = new Map<string, string>();
    for (const inv of invoices) {
      const no = String(inv.InvoiceNo ?? "").trim();
      const cust = String(inv.CustomerCode ?? "").trim();
      if (!no || !cust) continue;
      const dateIso = isoDayOf(inv.InvoiceDate);
      invoiceMeta.set(no, { customerCode: cust, dateIso });
      if (dateIso) {
        const prev = lastInvoiceIsoByCustomer.get(cust);
        if (!prev || dateIso > prev) lastInvoiceIsoByCustomer.set(cust, dateIso);
      }
    }

    // In-period sales per customer — Invoice Items joined to Invoices by
    // InvoiceNo→CustomerCode, sum LineTotal (same join shape as
    // route-planning.service.ts computeSalesByCustomer / REL-CU-002).
    const salesByCustomer = new Map<string, number>();
    const invoiceCountByCustomer = new Map<string, number>();
    for (const [, meta] of invoiceMeta) {
      if (meta.dateIso && meta.dateIso >= range.from && meta.dateIso <= range.to) {
        invoiceCountByCustomer.set(meta.customerCode, (invoiceCountByCustomer.get(meta.customerCode) ?? 0) + 1);
      }
    }
    for (const item of items) {
      const meta = invoiceMeta.get(String(item.InvoiceNo ?? "").trim());
      if (!meta || !meta.dateIso || meta.dateIso < range.from || meta.dateIso > range.to) continue;
      const amount = toFiniteNumber(item.LineTotal) ?? 0;
      salesByCustomer.set(meta.customerCode, (salesByCustomer.get(meta.customerCode) ?? 0) + amount);
    }

    // Outstanding collections exposure (Pending/Bounced are a stock, not a
    // flow — counted regardless of the analysis period).
    const exposureByCustomer = new Map<string, number>();
    for (const col of collections) {
      const cust = String(col.CustomerCode ?? "").trim();
      const status = String(col.Status ?? "").trim().toLowerCase();
      if (!cust || (status !== "pending" && status !== "bounced")) continue;
      exposureByCustomer.set(cust, (exposureByCustomer.get(cust) ?? 0) + (toFiniteNumber(col.Amount) ?? 0));
    }

    const lastVisitIsoByCustomer = new Map<string, string>();
    for (const visit of visits) {
      const cust = String(visit.CustomerCode ?? "").trim();
      const dateIso = isoDayOf(visit.VisitDate);
      if (!cust || !dateIso) continue;
      const prev = lastVisitIsoByCustomer.get(cust);
      if (!prev || dateIso > prev) lastVisitIsoByCustomer.set(cust, dateIso);
    }

    // Build per-customer entries with raw score components.
    const periodDays = Math.max(1, daysBetween(range.from, range.to));
    const raw = todayCustomers.map((row) => {
      const code = String(row.CustomerCode ?? "").trim();
      const lat = toFiniteNumber(row.Latitude);
      const lon = toFiniteNumber(row.Longitude);
      const hasCoords = lat !== null && lon !== null && isSaneCoordinate(lat, lon);
      const invoiceCount = invoiceCountByCustomer.get(code) ?? 0;
      const sales = salesByCustomer.get(code) ?? 0;
      const lastInvoiceIso = lastInvoiceIsoByCustomer.get(code) ?? null;
      return {
        customerCode: code,
        customerName: String(row.CustomerName ?? code),
        lat: hasCoords ? lat : null,
        lon: hasCoords ? lon : null,
        visitSequence: toFiniteNumber(row.VisitSequence),
        channel: String(row.Channel ?? "").trim() || null,
        avgOrderValue: invoiceCount > 0 ? round2(sales / invoiceCount) : 0,
        lastVisitDate: lastVisitIsoByCustomer.get(code) ?? null,
        // never invoiced in the data → treat as the maximum gap (most stale)
        gapDays: lastInvoiceIso ? Math.min(daysBetween(lastInvoiceIso, todayIso), periodDays * 4) : null,
        exposure: exposureByCustomer.get(code) ?? 0,
      };
    });

    // priorityScore 0-100: avgOrderValue 40% + invoice recency gap 30%
    // (longer gap = higher) + Pending/Bounced collections exposure 30%,
    // each min-max normalized across today's customer set.
    const maxObservedGap = raw.reduce((m, r) => Math.max(m, r.gapDays ?? 0), 0);
    const gaps = raw.map((r) => r.gapDays ?? Math.max(maxObservedGap, periodDays));
    const aovs = raw.map((r) => r.avgOrderValue);
    const exposures = raw.map((r) => r.exposure);
    const bounds = (values: number[]) => ({ min: Math.min(...values), max: Math.max(...values) });
    const aovB = raw.length > 0 ? bounds(aovs) : { min: 0, max: 0 };
    const gapB = raw.length > 0 ? bounds(gaps) : { min: 0, max: 0 };
    const expB = raw.length > 0 ? bounds(exposures) : { min: 0, max: 0 };

    const entries: DailyBriefCustomer[] = raw.map((r, i) => ({
      customerCode: r.customerCode,
      customerName: r.customerName,
      lat: r.lat,
      lon: r.lon,
      visitSequence: r.visitSequence,
      channel: r.channel,
      avgOrderValue: r.avgOrderValue,
      lastVisitDate: r.lastVisitDate,
      priorityScore: round2(
        100 * (0.4 * normalize(r.avgOrderValue, aovB.min, aovB.max) + 0.3 * normalize(gaps[i]!, gapB.min, gapB.max) + 0.3 * normalize(r.exposure, expB.min, expB.max)),
      ),
    }));

    // Default order = plan order (VisitSequence asc, unsequenced last).
    entries.sort((a, b) => {
      const sa = a.visitSequence ?? Number.POSITIVE_INFINITY;
      const sb = b.visitSequence ?? Number.POSITIVE_INFINITY;
      return sa !== sb ? sa - sb : a.customerName.localeCompare(b.customerName);
    });

    const missingCoords = entries.filter((e) => e.lat === null).length;
    if (missingCoords > 0) {
      warnings.push(`${missingCoords} من عملاء اليوم بدون إحداثيات صالحة — استُبعدوا من حساب المسافة.`);
    }

    // Route effort estimate: nearest-neighbor chain over customers with
    // usable coordinates (Haversine, same as route-balancer.util), then
    // distance / 30 km/h + 15 min per planned visit.
    const coordEntries = entries.filter((e) => e.lat !== null && e.lon !== null);
    const points: LatLon[] = coordEntries.map((e) => ({ lat: e.lat!, lon: e.lon! }));
    const { distanceKm } = this.nearestNeighborOrder(points, 0);
    const estimatedDistanceKm = round2(distanceKm);
    const estimatedDurationMin = round2((distanceKm / AVERAGE_SPEED_KMH) * 60 + MINUTES_PER_VISIT * entries.length);

    // Per-day sales target: current-month Targets over visible routes,
    // spread across the month's working days (Sales Calendar if present,
    // else 26).
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    let targetSum = 0;
    let hasTargetRows = false;
    for (const t of targets) {
      if (!matchesMonth(t.Month, month) || (toFiniteNumber(t.Year) ?? -1) !== year) continue;
      hasTargetRows = true;
      targetSum += toFiniteNumber(t.SalesTarget) ?? 0;
    }
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    let workingDaysInMonth = 0;
    for (const row of calendar) {
      const dIso = isoDayOf(row.CalendarDate);
      if (dIso && dIso.startsWith(monthPrefix) && isTruthyFlag(row.WorkingDay)) workingDaysInMonth++;
    }
    if (workingDaysInMonth === 0) workingDaysInMonth = FALLBACK_WORKING_DAYS_PER_MONTH;
    const dailyTargetSales = hasTargetRows ? round2(targetSum / workingDaysInMonth) : null;

    return {
      date: todayIso,
      weekday,
      isWorkingDay,
      visitCount: entries.length,
      dailyTargetSales,
      expectedSalesTotal: round2(entries.reduce((sum, e) => sum + e.avgOrderValue, 0)),
      estimatedDistanceKm,
      estimatedDurationMin,
      customers: entries,
      warnings,
    };
  }

  // ------------------------------------------------------------------
  // 2) POST /visit-copilot/plan
  // ------------------------------------------------------------------

  async plan(user: AuthenticatedUser, body: VisitCopilotPlanRequest) {
    const brief = await this.buildDailyBrief(user, body);
    let customers: DailyBriefCustomer[];
    if (body.mode === "priority") {
      customers = [...brief.customers].sort((a, b) => b.priorityScore - a.priorityScore || a.customerName.localeCompare(b.customerName));
    } else {
      // "route": nearest-neighbor geographic chain starting from the first
      // customer by VisitSequence; customers without usable coordinates are
      // appended at the end in their original plan order.
      const withCoords = brief.customers.filter((c) => c.lat !== null && c.lon !== null);
      const without = brief.customers.filter((c) => c.lat === null || c.lon === null);
      const { order } = this.nearestNeighborOrder(withCoords.map((c) => ({ lat: c.lat!, lon: c.lon! })), 0);
      customers = [...order.map((i) => withCoords[i]!), ...without];
    }
    const distanceKm = this.chainDistanceKm(customers);
    return {
      mode: body.mode,
      customers,
      estimatedDistanceKm: round2(distanceKm),
      estimatedDurationMin: round2((distanceKm / AVERAGE_SPEED_KMH) * 60 + MINUTES_PER_VISIT * customers.length),
    };
  }

  // Greedy nearest-neighbor chain (Haversine). Returns visiting order (as
  // indices into `points`) + total chain length. O(n²) — a day plan is a
  // few dozen customers at most.
  private nearestNeighborOrder(points: LatLon[], startIndex: number): { order: number[]; distanceKm: number } {
    const n = points.length;
    if (n === 0) return { order: [], distanceKm: 0 };
    const visited = new Array<boolean>(n).fill(false);
    const order: number[] = [startIndex];
    visited[startIndex] = true;
    let current = startIndex;
    let distanceKm = 0;
    for (let step = 1; step < n; step++) {
      let best = -1;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < n; i++) {
        if (visited[i]) continue;
        const d = haversineKm(points[current]!, points[i]!);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best === -1) break;
      visited[best] = true;
      order.push(best);
      distanceKm += bestD;
      current = best;
    }
    return { order, distanceKm };
  }

  // Sum of consecutive Haversine legs following the given order, skipping
  // customers without coordinates.
  private chainDistanceKm(customers: DailyBriefCustomer[]): number {
    let distance = 0;
    let prev: LatLon | null = null;
    for (const c of customers) {
      if (c.lat === null || c.lon === null) continue;
      const p = { lat: c.lat, lon: c.lon };
      if (prev) distance += haversineKm(prev, p);
      prev = p;
    }
    return distance;
  }

  // ------------------------------------------------------------------
  // 3) GET /visit-copilot/briefing/:customerCode
  // ------------------------------------------------------------------

  async briefing(user: AuthenticatedUser, customerCode: string, query: VisitCopilotBriefingQuery): Promise<CustomerBriefingResult> {
    return this.buildBriefing(user, customerCode, query);
  }

  private async buildBriefing(user: AuthenticatedUser, customerCode: string, opts: PeriodInput & { vanStock: boolean }): Promise<CustomerBriefingResult> {
    const ctx = this.rieContext(user);
    const range = resolveVisitCopilotPeriod(opts);
    const warnings: string[] = [];

    const customers = await this.requireCustomers(ctx);
    const code = customerCode.trim();
    const customer = customers.find((row) => String(row.CustomerCode ?? "").trim() === code);
    // Hierarchy scoping already narrowed `customers` — a code outside the
    // rep's visible routes is indistinguishable from a non-existent one.
    if (!customer) throw new NotFoundException("العميل غير موجود ضمن نطاقك.");

    const [invoices, items, returns, collections, products, vanInventory] = await Promise.all([
      this.tryEntity(ctx, "Invoices", "الفواتير", warnings),
      this.tryEntity(ctx, "Invoice Items", "أصناف الفاتورة", warnings),
      this.tryEntity(ctx, "Returns", "المرتجعات", warnings),
      this.tryEntity(ctx, "Collections", "التحصيلات", warnings),
      this.tryEntity(ctx, "Products", "الأصناف", warnings),
      opts.vanStock ? this.tryEntity(ctx, "Van Inventory", "مخزون السيارة", warnings) : Promise.resolve([] as readonly EntityRecord[]),
    ]);

    const productNames = new Map<string, string>();
    for (const p of products) {
      const pCode = String(p.ProductCode ?? "").trim();
      if (pCode) productNames.set(pCode, String(p.ProductName ?? pCode));
    }

    // Channel peers: other visible customers with the same Channel — the
    // comparison set for cross-sell candidates. A customer without a
    // channel is compared against all visible customers instead.
    const channel = String(customer.Channel ?? "").trim();
    const peerCodes = new Set<string>();
    for (const row of customers) {
      const c = String(row.CustomerCode ?? "").trim();
      if (!c || c === code) continue;
      if (channel === "" || String(row.Channel ?? "").trim().toLowerCase() === channel.toLowerCase()) peerCodes.add(c);
    }
    if (channel === "") warnings.push("العميل بدون قناة (Channel) محددة — تمت مقارنة الأصناف بكل عملاء نطاقك.");

    // In-period invoice metadata (all visible customers — needed for peers).
    const invoiceMeta = new Map<string, { customerCode: string; dateIso: string }>();
    for (const inv of invoices) {
      const no = String(inv.InvoiceNo ?? "").trim();
      const cust = String(inv.CustomerCode ?? "").trim();
      const dateIso = isoDayOf(inv.InvoiceDate);
      if (!no || !cust || !dateIso || dateIso < range.from || dateIso > range.to) continue;
      invoiceMeta.set(no, { customerCode: cust, dateIso });
    }

    // One pass over Invoice Items: this customer's totals/top products +
    // peer product demand, all in the analysis period.
    let salesTotal = 0;
    const valueByInvoice = new Map<string, number>(); // this customer only — feeds the half-vs-half trend
    const customerProducts = new Map<string, { qty: number; value: number }>();
    const peerProductValue = new Map<string, number>();
    for (const item of items) {
      const no = String(item.InvoiceNo ?? "").trim();
      const meta = invoiceMeta.get(no);
      if (!meta) continue;
      const value = toFiniteNumber(item.LineTotal) ?? 0;
      const pCode = String(item.ProductCode ?? "").trim();
      if (meta.customerCode === code) {
        salesTotal += value;
        valueByInvoice.set(no, (valueByInvoice.get(no) ?? 0) + value);
        if (pCode) {
          const agg = customerProducts.get(pCode) ?? { qty: 0, value: 0 };
          agg.qty += toFiniteNumber(item.Quantity) ?? 0;
          agg.value += value;
          customerProducts.set(pCode, agg);
        }
      } else if (peerCodes.has(meta.customerCode) && pCode) {
        peerProductValue.set(pCode, (peerProductValue.get(pCode) ?? 0) + value);
      }
    }

    let invoiceCount = 0;
    for (const [, meta] of invoiceMeta) if (meta.customerCode === code) invoiceCount++;

    // Trend: second half of the period vs the first half of the same period.
    const midIso = isoDay(new Date((Date.parse(`${range.from}T00:00:00Z`) + Date.parse(`${range.to}T00:00:00Z`)) / 2));
    let firstHalf = 0;
    let secondHalf = 0;
    for (const [no, value] of valueByInvoice) {
      const meta = invoiceMeta.get(no)!;
      if (meta.dateIso <= midIso) firstHalf += value;
      else secondHalf += value;
    }
    const trendPct = firstHalf > 0 ? round2(((secondHalf - firstHalf) / firstHalf) * 100) : null;

    // Returns in the period.
    let returnsTotal = 0;
    for (const ret of returns) {
      if (String(ret.CustomerCode ?? "").trim() !== code) continue;
      const dateIso = isoDayOf(ret.ReturnDate);
      if (!dateIso || dateIso < range.from || dateIso > range.to) continue;
      returnsTotal += toFiniteNumber(ret.TotalAmount) ?? 0;
    }
    const returnsRate = salesTotal > 0 ? round2((returnsTotal / salesTotal) * 100) : null;

    // Collections: collected is a flow (period-scoped); Pending/Bounced are
    // outstanding exposure (a stock — counted regardless of period).
    const todayIso = isoDay(new Date());
    let collected = 0;
    let pending = 0;
    let bounced = 0;
    let overdueAmount = 0;
    let oldestPendingDueDate: string | null = null;
    for (const col of collections) {
      if (String(col.CustomerCode ?? "").trim() !== code) continue;
      const status = String(col.Status ?? "").trim().toLowerCase();
      const amount = toFiniteNumber(col.Amount) ?? 0;
      if (status === "collected") {
        const dateIso = isoDayOf(col.CollectionDate);
        if (dateIso && dateIso >= range.from && dateIso <= range.to) collected += amount;
      } else if (status === "pending") {
        pending += amount;
        const dueIso = isoDayOf(col.DueDate);
        if (dueIso) {
          if (!oldestPendingDueDate || dueIso < oldestPendingDueDate) oldestPendingDueDate = dueIso;
          if (dueIso < todayIso) overdueAmount += amount;
        }
      } else if (status === "bounced") {
        bounced += amount;
      }
    }

    const topProducts: BriefingProduct[] = Array.from(customerProducts.entries())
      .map(([pCode, agg]) => ({ productCode: pCode, productName: productNames.get(pCode) ?? pCode, qty: round2(agg.qty), value: round2(agg.value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_PRODUCTS_LIMIT);

    // Cross-sell candidates: products channel-peers buy in the period that
    // this customer doesn't, ranked by peer demand value. With the van
    // stock filter on, only products present (Quantity > 0) in the latest
    // Van Inventory report of the rep's visible routes survive.
    let candidates = Array.from(peerProductValue.entries())
      .filter(([pCode]) => !customerProducts.has(pCode))
      .sort((a, b) => b[1] - a[1]);
    if (opts.vanStock) {
      if (vanInventory.length > 0) {
        let latestIso: string | null = null;
        for (const row of vanInventory) {
          const dIso = isoDayOf(row.ReportDate);
          if (dIso && (!latestIso || dIso > latestIso)) latestIso = dIso;
        }
        const inVan = new Set<string>();
        for (const row of vanInventory) {
          const dIso = isoDayOf(row.ReportDate);
          const pCode = String(row.ProductCode ?? "").trim();
          if (dIso === latestIso && pCode && (toFiniteNumber(row.Quantity) ?? 0) > 0) inVan.add(pCode);
        }
        candidates = candidates.filter(([pCode]) => inVan.has(pCode));
      } else {
        warnings.push("فلتر مخزون السيارة مفعّل لكن لا توجد بيانات مخزون — عُرضت الاقتراحات دون فلترة.");
      }
    }
    const missingProducts: BriefingMissingProduct[] = candidates.slice(0, MISSING_PRODUCTS_LIMIT).map(([pCode, value]) => ({
      productCode: pCode,
      productName: productNames.get(pCode) ?? pCode,
      reason: `عملاء بنفس القناة اشتروه بقيمة ${round2(value)} خلال الفترة وهذا العميل لا يشتريه`,
    }));

    // Rule-based briefing strings (instant — no model call). Priority:
    // bounced/overdue collection > declining trend > biggest cross-sell
    // value > reorder top product.
    const { topOpportunity, suggestedGoal, actions } = this.composeGuidance({
      bounced: round2(bounced),
      overdueAmount: round2(overdueAmount),
      pending: round2(pending),
      trendPct,
      firstHalf: round2(firstHalf),
      topMissing: missingProducts[0] ?? null,
      topMissingValue: candidates.length > 0 ? round2(candidates[0]![1]) : 0,
      topProduct: topProducts[0] ?? null,
    });

    return {
      customerCode: code,
      customerName: String(customer.CustomerName ?? code),
      period: range,
      sales: { total: round2(salesTotal), invoiceCount, trendPct },
      returns: { total: round2(returnsTotal), rate: returnsRate },
      collections: { collected: round2(collected), pending: round2(pending), bounced: round2(bounced), oldestPendingDueDate },
      topProducts,
      missingProducts,
      topOpportunity,
      suggestedGoal,
      actions,
      warnings,
    };
  }

  private composeGuidance(input: {
    bounced: number;
    overdueAmount: number;
    pending: number;
    trendPct: number | null;
    firstHalf: number;
    topMissing: BriefingMissingProduct | null;
    topMissingValue: number;
    topProduct: BriefingProduct | null;
  }): { topOpportunity: string; suggestedGoal: string; actions: string[] } {
    const actions: string[] = [];
    let topOpportunity: string;
    let suggestedGoal: string;

    const collectionRisk = round2(input.bounced + input.overdueAmount);
    const declining = input.trendPct !== null && input.trendPct < 0;

    if (collectionRisk > 0) {
      topOpportunity =
        input.bounced > 0
          ? `يوجد تحصيل مرتد/متأخر بقيمة ${collectionRisk} — تحصيله أهم من أي طلب جديد في هذه الزيارة.`
          : `يوجد تحصيل متأخر عن استحقاقه بقيمة ${collectionRisk} — حصّله قبل مناقشة أي طلب جديد.`;
      suggestedGoal = `هدف الزيارة: تحصيل ${collectionRisk} من المبالغ المتأخرة قبل تسجيل أي طلب جديد.`;
    } else if (declining) {
      topOpportunity = `مبيعات العميل متراجعة ${Math.abs(input.trendPct!)}% في النصف الثاني من الفترة — اكتشف السبب قبل أن تخسره.`;
      suggestedGoal = `هدف الزيارة: طلب يعيد العميل قريبًا من مستوى النصف الأول من الفترة (${input.firstHalf}).`;
    } else if (input.topMissing) {
      topOpportunity = `فرصة بيع متقاطع: العميل لا يشتري "${input.topMissing.productName}" الذي حقق ${input.topMissingValue} لدى عملاء قناته.`;
      suggestedGoal = `هدف الزيارة: إدخال صنف "${input.topMissing.productName}" بطلب تجريبي أول.`;
    } else if (input.topProduct) {
      topOpportunity = `أفضل فرصة اليوم إعادة تعبئة "${input.topProduct.productName}" — الصنف الأعلى للعميل بقيمة ${input.topProduct.value} خلال الفترة.`;
      suggestedGoal = `هدف الزيارة: طلب إعادة تعبئة لصنف "${input.topProduct.productName}".`;
    } else {
      topOpportunity = "لا توجد بيانات كافية خلال الفترة — أكبر فرصة هي تسجيل أول طلب وتحديث بيانات العميل.";
      suggestedGoal = "هدف الزيارة: تسجيل طلب جديد وتحديث بيانات العميل الأساسية.";
    }

    if (input.bounced > 0 || input.overdueAmount > 0) actions.push(`حصّل المبلغ المتأخر/المرتد (${collectionRisk})`);
    else if (input.pending > 0) actions.push(`تابع التحصيل المعلق (${input.pending})`);
    if (declining) actions.push("اسأل عن سبب تراجع المشتريات وسجّل الملاحظة");
    if (input.topMissing) actions.push(`اعرض صنف "${input.topMissing.productName}" كبيع متقاطع`);
    if (input.topProduct) actions.push(`اقترح إعادة تعبئة "${input.topProduct.productName}"`);
    if (actions.length < 2) actions.push("سجّل طلب الزيارة وحدّث بيانات العميل");
    if (actions.length < 2) actions.push("أكد موعد الزيارة القادمة قبل المغادرة");

    return { topOpportunity, suggestedGoal, actions: actions.slice(0, 4) };
  }

  // ------------------------------------------------------------------
  // 4) POST /visit-copilot/chat
  // ------------------------------------------------------------------

  async chat(user: AuthenticatedUser, body: VisitCopilotChatRequest): Promise<VisitCopilotChatResult> {
    // ------------------------------------------------------------------
    // FDA Local Decision Layer — tried BEFORE any AI call ("Cheapest Path
    // Wins"). Customer mode only: Dictionary Engine resolves a customer
    // mentioned by code or name in the message text against the same
    // hierarchy-scoped Customers rows Permission Check already narrowed
    // (no new RIE call, no new permission logic). This is a per-request
    // context switch only — it is NOT persisted anywhere (no session
    // table, no server memory). It is a deliberately temporary stand-in
    // for a platform-level Conversation Context Manager that would let
    // Smart Loading / Collections / Sales Coach share the same mechanism;
    // it must not grow into a VisitCopilot-specific session architecture.
    if (!body.prospectId) {
      const ctx = this.rieContext(user);
      const customers = await this.requireCustomers(ctx);
      const mentioned = resolveMentionedCustomer(body.message, customers);
      const switched = mentioned !== null && mentioned.customerCode !== body.customerCode;
      const activeCode = switched ? mentioned!.customerCode : body.customerCode!;

      const briefing = await this.buildBriefing(user, activeCode, body);
      // The switch is reported structurally (activeCustomerCode/Name), not
      // folded into the reply text — the frontend uses it to move its own
      // selected-customer state; the reply itself must not be the only
      // place that information lives.
      const switchFields = switched ? { activeCustomerCode: briefing.customerCode, activeCustomerName: briefing.customerName } : {};

      // Single entry point into the shared, generic Local Decision Engine —
      // this service supplies only message/facts/registry and never touches
      // matching, priority, or regex details itself (those live entirely in
      // the engine + VisitCopilotRuleRegistry). Rule ordering, including
      // Customer 360 taking priority over single-field patterns like
      // "الرصيد"/"أفضل منتج", is encoded in the registry, not here.
      const localReply = LocalDecisionEngine.execute({ message: body.message, facts: briefing, registry: VisitCopilotRuleRegistry });
      if (localReply) {
        // Matched a known direct question — answered entirely from
        // already-computed rule-based data, zero AI calls.
        return { reply: localReply, source: "local", ...switchFields };
      }
      // No local rule matched — fall through to AI, using whichever
      // customer's briefing is now active (possibly just switched).
      return this.chatWithAi(briefing, body, switchFields);
    }

    // Same briefing computation as the GET endpoints — the model gets the
    // finished, already-scoped numbers injected directly (no tool loop).
    // Phase 2: exactly one of customerCode | prospectId (schema-enforced) —
    // prospectId switches the context to the prospect briefing.
    const briefing = await this.buildProspectBriefing(user, body.prospectId, body);
    return this.chatWithAi(briefing, body, {});
  }

  private async chatWithAi(
    briefing: CustomerBriefingResult,
    body: VisitCopilotChatRequest,
    switchFields: { activeCustomerCode?: string; activeCustomerName?: string },
  ): Promise<VisitCopilotChatResult> {
    const apiKey = this.appConfig.values.anthropic.apiKey;
    if (!apiKey) {
      throw new BadRequestException("مساعد الزيارة يحتاج ANTHROPIC_API_KEY مضبوط على السيرفر. راجع فريقك التقني لضبطه في متغيرات البيئة.");
    }

    const systemPrompt = [
      'أنت "مساعد الزيارة" داخل منصة FSOS — مساعد قرارات ميداني يساعد مندوب المبيعات قبل وأثناء زيارة عميل واحد محدد.',
      body.prospectId
        ? `بيانات هذا العميل المحتمل (Prospect) التالية محسوبة مسبقًا من بيانات الشركة الفعلية للفترة من ${briefing.period.from} إلى ${briefing.period.to}، وهي مصدرك الوحيد للأرقام — لا تخترع أي رقم غير موجود فيها. لا يوجد تعامل سابق معه (الأرقام الصفرية طبيعية)، وأفضل الأصناف معروضة من عملاء نفس القناة، والهدف فتح التعامل بأول طلبية:`
        : `بيانات هذا العميل التالية محسوبة مسبقًا من بيانات الشركة الفعلية للفترة من ${briefing.period.from} إلى ${briefing.period.to}، وهي مصدرك الوحيد للأرقام — لا تخترع أي رقم غير موجود فيها:`,
      JSON.stringify(briefing),
      "قواعد الرد:",
      "- جاوب بالعربية فقط وباختصار شديد (2-4 جمل أو نقاط قصيرة) وبأسلوب عملي موجّه للتنفيذ داخل الزيارة.",
      "- التزم بهذا العميل وهذا السياق فقط؛ أي سؤال خارجهما اعتذر عنه بجملة واحدة.",
      "- لو البيانات غير كافية للإجابة قل ذلك صراحة بدل التخمين.",
    ].join("\n");

    const messages = [
      ...body.history.slice(-VISIT_COPILOT_LIMITS.maxHistoryMessages).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: body.message },
    ];

    // Same Claude client approach + config as assistant.service.ts (plain
    // fetch to the Messages API, cached system block, same model) — no new
    // env var, no SDK dependency.
    let response: globalThis.Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: CHAT_MAX_TOKENS,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages,
        }),
      });
    } catch {
      throw new BadRequestException("تعذر الاتصال بمساعد الزيارة، حاول تاني.");
    }
    if (!response.ok) {
      throw new BadRequestException(`فشل طلب مساعد الزيارة (${response.status}).`);
    }
    const data = (await response.json()) as { content: ClaudeTextBlock[] };
    const reply = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!)
      .join("\n")
      .trim();

    return { reply: reply || "معرفتش أوصل لإجابة واضحة، جرب تصيغ سؤالك بشكل مختلف.", source: "ai", ...switchFields };
  }

  // ------------------------------------------------------------------
  // "ملخص اليوم 360°" — see visit-copilot.schemas.ts's DTO comment for the
  // full design rationale. Facts/numbers/decisions come ONLY from
  // SgiService.getLatest(user) (already hierarchy-scoped) + the existing
  // daily-brief plan basis — zero new Excel reads. The narrative sections
  // (executiveSummary/topIssue/diagnosis per customer/rootCauses/
  // executiveDecision/closingPhrase) are filled by exactly one bounded
  // Claude call that may only rephrase/order these already-computed facts
  // (same "generation, not analysis" pattern as heatmap.decisionSummary());
  // buildTemplateNarrative() below is the mandatory deterministic fallback
  // when that call fails, is slow, or ANTHROPIC_API_KEY isn't configured.
  // ------------------------------------------------------------------

  private readonly ROLE_LABEL_AR: Record<AuthenticatedUser["roleCode"], string> = {
    SUPER_ADMIN: "مدير المنصة",
    COMPANY_ADMIN: "مدير الشركة",
    MANAGER: "مدير",
    SUPERVISOR: "مشرف",
    SALES_REP: "مندوب مبيعات",
  };

  async daily360Summary(user: AuthenticatedUser, query: VisitCopilotDaily360SummaryQuery): Promise<VisitCopilot360Summary> {
    const warnings: string[] = [];
    const todayIso = isoDay(new Date());

    const [sgi, brief, dbUser] = await Promise.all([
      this.sgiService.getLatest(user),
      this.buildDailyBrief(user, query),
      this.prisma.user.findUnique({ where: { id: user.userId } }),
    ]);

    if (!sgi) {
      warnings.push("لا يوجد تحليل SGI محسوب بعد لشركتك — بعض أقسام التقرير ستكون فارغة حتى يتم أول احتساب.");
    }

    const range = resolveVisitCopilotPeriod(query);
    const situations: SgiSituation[] = sgi?.situations ?? [];

    const scopeLabelByRole: Record<AuthenticatedUser["roleCode"], string> = {
      SUPER_ADMIN: "المنصة بالكامل",
      COMPANY_ADMIN: "الشركة بالكامل",
      MANAGER: "المديرين والمشرفين والمندوبين التابعين لك",
      SUPERVISOR: "قطاعك وفريق المندوبين التابع لك",
      SALES_REP: "مسارك وعملاؤك فقط",
    };

    // ---- Goal / achievement.
    const goalTargetTotal = sgi?.summary.monthlyGoal.targetTotal ?? null;
    const goalActualTotal = sgi?.summary.monthlyGoal.actualTotal ?? 0;
    const goal = {
      targetTotal: goalTargetTotal,
      actualTotal: goalActualTotal,
      progressPct: sgi?.summary.monthlyGoal.progressPct ?? null,
      remainingGap: goalTargetTotal !== null ? Math.max(0, goalTargetTotal - goalActualTotal) : null,
    };

    // ---- Sales + lost opportunities (PRODUCT_DECLINE + LOST_SALES, ranked
    // by decline value). 2026-07-28, corrected per explicit customer
    // feedback: scoped to TODAY'S route customers only (brief.customers —
    // the same "today's plan" set the rest of this screen already uses),
    // not every historically-declining customer across the viewer's whole
    // hierarchy. An earlier version first capped this at top-5 (too few),
    // then removed the cap entirely (too many — showed customers who
    // aren't even on today's route). This is the right scope: no numeric
    // cap, but bounded to today's actual visit list.
    const todayCustomerNames = new Set(brief.customers.map((c) => c.customerName));
    const declineSituations = situations.filter(
      (s) => (s.type === "PRODUCT_DECLINE" || s.type === "LOST_SALES") && todayCustomerNames.has(s.entityLabel),
    );
    const topDeclines = [...declineSituations].sort(
      (a, b) => (b.metricValuePrior ?? 0) - b.metricValue - ((a.metricValuePrior ?? 0) - a.metricValue),
    );

    const lastVisitByCustomerName = new Map<string, string | null>();
    for (const c of brief.customers) lastVisitByCustomerName.set(c.customerName, c.lastVisitDate);

    const lostOpportunities = topDeclines.map((s) => {
      const before = s.metricValuePrior ?? 0;
      const after = s.metricValue;
      return {
        customerName: s.entityLabel,
        declineValue: Math.max(0, before - after),
        valueBefore: before,
        valueAfter: after,
        lastVisitDate: lastVisitByCustomerName.get(s.entityLabel) ?? null,
        stoppedProducts: s.stoppedProducts ?? [],
        diagnosis: s.detail,
        visitDecision: s.recommendation,
      };
    });

    // ---- Collections + priority debtors (COLLECTION_RISK situations).
    const collectionSituations = situations.filter((s) => s.type === "COLLECTION_RISK");
    const priorityDebtors = [...collectionSituations]
      .sort((a, b) => b.metricValue - a.metricValue)
      .slice(0, 5)
      .map((s) => ({ customerName: s.entityLabel, amount: s.metricValue, dueDate: null as string | null }));

    // ---- Returns + recurring risks — SGI has no dedicated RETURNS type;
    // surfaced from GROWTH_OPPORTUNITY-adjacent detail text isn't
    // appropriate here, so this stays a numeric-only section (no per-item
    // Excel re-read) until a RETURNS_RISK situation type exists. Honest
    // empty state rather than an invented number.
    const returns = { total: 0, rate: null as number | null, recurringRisks: [] as string[] };

    // ---- Customers/teams needing intervention — top severity-ranked
    // situations across all types, capped at 6.
    const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const interventionNeeded = [...situations]
      .sort((a, b) => severityRank[a.severity]! - severityRank[b.severity]!)
      .slice(0, 6)
      .map((s) => ({ name: s.entityLabel, reason: s.title, severity: s.severity }));

    const highSeverityCount = sgi?.summary.highSeverityCount ?? 0;
    const topIssueSituation = situations.find((s) => s.severity === "high") ?? situations[0] ?? null;

    const userName = dbUser?.fullName ?? user.email;
    const roleLabel = this.ROLE_LABEL_AR[user.roleCode];
    const scopeLabel = scopeLabelByRole[user.roleCode];

    const baseFacts = {
      generatedAt: new Date().toISOString(),
      reportDate: todayIso,
      period: range,
      scopeLabel,
      userName,
      roleLabel,
      goal,
      sales: { total: brief.expectedSalesTotal, invoiceCount: lostOpportunities.length, visitCount: brief.visitCount },
      lostOpportunities,
      collections: { collected: 0, pending: priorityDebtors.reduce((sum, d) => sum + d.amount, 0), bounced: 0, priorityDebtors },
      returns,
      interventionNeeded,
      warnings: [...warnings, ...(sgi?.warnings ?? [])],
      highSeverityCount,
      topIssueSituation,
    };

    const narrative = await this.buildDaily360Narrative(baseFacts);

    return {
      generatedAt: baseFacts.generatedAt,
      reportDate: baseFacts.reportDate,
      period: baseFacts.period,
      scopeLabel: baseFacts.scopeLabel,
      userName: baseFacts.userName,
      roleLabel: baseFacts.roleLabel,
      narrativeSource: narrative.source,
      executiveSummary: narrative.executiveSummary,
      topIssue: narrative.topIssue,
      goal: baseFacts.goal,
      sales: baseFacts.sales,
      lostOpportunities: baseFacts.lostOpportunities,
      collections: baseFacts.collections,
      returns: baseFacts.returns,
      interventionNeeded: baseFacts.interventionNeeded,
      rootCauses: narrative.rootCauses,
      executiveDecision: narrative.executiveDecision,
      executionPlan: narrative.executionPlan,
      closingPhrase: narrative.closingPhrase,
      warnings: baseFacts.warnings,
    };
  }

  // Deterministic Arabic template — the mandatory fallback, and also what
  // ends up on screen whenever ANTHROPIC_API_KEY isn't configured or the
  // bounded call fails/times out. Every sentence here is built ONLY from
  // fields already present on `facts` (see daily360Summary above) — no
  // invented numbers or names.
  private buildTemplateNarrative(facts: Daily360Facts): Daily360Narrative {
    const goalLine =
      facts.goal.targetTotal !== null
        ? `تحقق ${facts.goal.progressPct ?? 0}% من الهدف الشهري (${fmtNum(facts.goal.actualTotal)} من ${fmtNum(facts.goal.targetTotal)})، والمتبقي ${fmtNum(facts.goal.remainingGap ?? 0)}.`
        : `لا يوجد هدف شهري محدد لنطاقك؛ إجمالي المحقق حتى الآن ${fmtNum(facts.goal.actualTotal)}.`;

    const lostLine =
      facts.lostOpportunities.length > 0
        ? `رصدنا ${facts.lostOpportunities.length} فرصة ضائعة أبرزها ${facts.lostOpportunities[0]!.customerName} بتراجع ${fmtNum(facts.lostOpportunities[0]!.declineValue)}.`
        : "لا توجد فرص ضائعة بارزة في نطاقك حاليًا.";

    const collectionLine =
      facts.collections.priorityDebtors.length > 0
        ? `يوجد ${facts.collections.priorityDebtors.length} عميل ذو أولوية تحصيل بإجمالي مستحقات ${fmtNum(facts.collections.pending)}.`
        : "لا توجد مستحقات تحصيل ذات أولوية عالية حاليًا.";

    const executiveSummary = [goalLine, lostLine, collectionLine].join(" ");

    const topIssue = facts.topIssueSituation
      ? `${facts.topIssueSituation.title} — ${facts.topIssueSituation.detail}`
      : facts.lostOpportunities.length > 0
        ? `${facts.lostOpportunities[0]!.customerName}: ${facts.lostOpportunities[0]!.diagnosis}`
        : null;

    const gaps: string[] = [];
    if (facts.lostOpportunities.length > 0) gaps.push("عملاء نشطون توقفوا عن شراء أصناف كانوا يشترونها بانتظام دون متابعة ميدانية كافية.");
    if (facts.collections.priorityDebtors.length > 0) gaps.push("تراكم مستحقات تحصيل لدى عدد من العملاء دون خطة تحصيل واضحة الأولوية.");
    if (facts.goal.targetTotal !== null && (facts.goal.progressPct ?? 0) < 70) gaps.push("وتيرة تحقيق الهدف الشهري أبطأ من المطلوب لتغطية الفجوة المتبقية.");
    while (gaps.length < 3) gaps.push("يلزم مراجعة ميدانية أوسع لتأكيد السبب الجذري بدقة أكبر.");

    const rootCauses = {
      narrative: "بمراجعة الأرقام أعلاه، الأسباب المرجّحة وراء الوضع الحالي هي:",
      gaps: gaps.slice(0, 3),
    };

    const executiveDecision =
      facts.lostOpportunities.length > 0 || facts.collections.priorityDebtors.length > 0
        ? "التركيز اليوم على زيارة العملاء الأعلى تأثرًا بالتراجع والتحصيل، مع متابعة أسبوعية لقياس الأثر."
        : "الاستمرار على نفس الخطة مع مراقبة أي تغيير في الأداء.";

    const executionPlan: VisitCopilot360Summary["executionPlan"] = [];
    if (facts.lostOpportunities.length > 0) {
      executionPlan.push({
        priority: "عالية" as const,
        action: `زيارة ${facts.lostOpportunities[0]!.customerName} ومناقشة سبب تراجع الشراء`,
        owner: facts.userName,
        successMetric: "عودة قيمة الطلبية لمستوى الفترة السابقة",
      });
    }
    if (facts.collections.priorityDebtors.length > 0) {
      executionPlan.push({
        priority: "عالية" as const,
        action: `متابعة تحصيل مستحقات ${facts.collections.priorityDebtors[0]!.customerName}`,
        owner: facts.userName,
        successMetric: "تحصيل المبلغ المستحق أو الاتفاق على موعد سداد",
      });
    }
    if (facts.goal.targetTotal !== null && (facts.goal.remainingGap ?? 0) > 0) {
      executionPlan.push({
        priority: "متوسطة" as const,
        action: "زيادة عدد الزيارات الفعالة لتغطية الفجوة المتبقية من الهدف الشهري",
        owner: facts.userName,
        successMetric: `تقليل الفجوة المتبقية (${fmtNum(facts.goal.remainingGap ?? 0)})`,
      });
    }
    if (executionPlan.length === 0) {
      executionPlan.push({
        priority: "منخفضة" as const,
        action: "الاستمرار في خطة الزيارات الحالية",
        owner: facts.userName,
        successMetric: "الحفاظ على مستوى الأداء الحالي",
      });
    }

    return {
      source: "template",
      executiveSummary,
      topIssue,
      rootCauses,
      executiveDecision,
      executionPlan,
      closingPhrase: "الميدان هو مصدر الحقيقة — كل قرار هنا مبني على أرقام فعلية من بياناتك.",
    };
  }

  // ONE bounded Claude call per report — reorders/phrases the sections
  // above; never allowed to introduce a fact not already in `facts`. Falls
  // back to the deterministic template on any failure, timeout, or missing
  // API key, per explicit product requirement.
  private async buildDaily360Narrative(facts: Daily360Facts): Promise<Daily360Narrative> {
    const apiKey = this.appConfig.values.anthropic.apiKey;
    if (!apiKey) return this.buildTemplateNarrative(facts);

    const systemPrompt = [
      'أنت محرر تقارير تنفيذية داخل منصة FSOS. مهمتك الوحيدة إعادة صياغة وترتيب الحقائق التالية في تقرير عربي احترافي — لا تخترع أي رقم أو اسم عميل أو صنف غير موجود في البيانات المرفقة.',
      "البيانات (JSON) هي مصدرك الوحيد:",
      JSON.stringify(facts),
      'أرجع JSON فقط بدون أي نص إضافي وبدون markdown، بالشكل الدقيق التالي:',
      '{"executiveSummary": string, "topIssue": string | null, "rootCauses": {"narrative": string, "gaps": [string, string, string]}, "executiveDecision": string, "executionPlan": [{"priority": "عالية"|"متوسطة"|"منخفضة", "action": string, "owner": string, "successMetric": string}], "closingPhrase": string}',
      "executiveSummary: 3-4 جمل تغطي الهدف والمبيعات والفرص الضائعة والتحصيل.",
      "topIssue: أهم مشكلة واحدة يجب الانتباه لها اليوم (أو null لو لا يوجد).",
      "rootCauses.gaps: بالضبط 3 أسباب جذرية محتملة، مبنية على الحقائق فقط.",
      "executionPlan: من 3 إلى 5 خطوات تنفيذية، owner يجب أن يكون userName من البيانات إلا لو كان هناك اسم عميل/مندوب أنسب من البيانات نفسها.",
      "closingPhrase: جملة ختامية قصيرة ملهمة عن الميدان أو الالتزام بالبيانات.",
    ].join("\n");

    let response: globalThis.Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DAILY_360_AI_TIMEOUT_MS);
      try {
        response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 1400,
            system: systemPrompt,
            messages: [{ role: "user", content: "ولّد التقرير الآن بناءً على البيانات المرفقة في التعليمات." }],
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return this.buildTemplateNarrative(facts);
    }
    if (!response.ok) return this.buildTemplateNarrative(facts);

    try {
      const data = (await response.json()) as { content?: ClaudeTextBlock[] };
      const text = (data.content ?? []).find((b) => b.type === "text")?.text ?? "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? text) as {
        executiveSummary?: string;
        topIssue?: string | null;
        rootCauses?: { narrative?: string; gaps?: string[] };
        executiveDecision?: string;
        executionPlan?: VisitCopilot360Summary["executionPlan"];
        closingPhrase?: string;
      };
      if (
        !parsed.executiveSummary ||
        !parsed.rootCauses?.narrative ||
        !Array.isArray(parsed.rootCauses.gaps) ||
        !parsed.executiveDecision ||
        !Array.isArray(parsed.executionPlan) ||
        parsed.executionPlan.length === 0 ||
        !parsed.closingPhrase
      ) {
        return this.buildTemplateNarrative(facts);
      }
      return {
        source: "ai",
        executiveSummary: parsed.executiveSummary,
        topIssue: parsed.topIssue ?? null,
        rootCauses: { narrative: parsed.rootCauses.narrative, gaps: parsed.rootCauses.gaps },
        executiveDecision: parsed.executiveDecision,
        executionPlan: parsed.executionPlan,
        closingPhrase: parsed.closingPhrase,
      };
    } catch {
      return this.buildTemplateNarrative(facts);
    }
  }

  // ------------------------------------------------------------------
  // 5) GET /visit-copilot/discovery — Customer Discovery (Phase 2)
  // ------------------------------------------------------------------

  async discovery(user: AuthenticatedUser, query: VisitCopilotDiscoveryQuery): Promise<DiscoveryResult> {
    const warnings: string[] = [];
    const stats = await this.buildDiscoveryStats(user, query, warnings);
    const rows = await this.prisma.prospect.findMany({ where: { companyId: user.companyId! }, orderBy: { createdAt: "desc" } });
    const prospects = this.scoreProspects(rows, stats).sort((a, b) => b.priorityScore - a.priorityScore);
    // Map layer of existing customers — only ones with usable coordinates.
    const customers: DiscoveryCustomer[] = stats.customers
      .filter((c) => c.lat !== null && c.lon !== null)
      .map((c) => ({ customerCode: c.customerCode, name: c.name, lat: c.lat!, lon: c.lon!, channel: c.channel, status: "existing" as const }));
    if (stats.repChannel === null) {
      warnings.push("لا توجد قناة (Channel) محددة لعملائك — درجات تطابق القناة قد تكون أقل دقة.");
    }
    return { customers, prospects, repChannel: stats.repChannel, warnings };
  }

  // ------------------------------------------------------------------
  // 6) POST /visit-copilot/discovery/google-search (+ alias
  //    POST /visit-copilot/discovery/search) — provider-based "search
  //    around me": OSM/Overpass by default, Google Places when the company
  //    opted in with its own key (CompanyProfile.discoveryProvider).
  // ------------------------------------------------------------------

  async discoverySearch(user: AuthenticatedUser, body: VisitCopilotGoogleSearchRequest): Promise<GoogleSearchResult> {
    const warnings: string[] = [];

    // Provider choice is a company-level setting; a missing profile row
    // (pre-Phase-2 edge case) behaves exactly like the default: OSM.
    const profile = await this.prisma.companyProfile.findUnique({ where: { companyId: user.companyId! } });
    let provider: ProspectDiscoveryProvider;
    if (profile?.discoveryProvider === "GOOGLE") {
      // Missing credential is a product state, not an error — the frontend
      // shows a "feature off" card, so this is HTTP 200 with disabled:true.
      // This is the ONLY disabled case: OSM needs no key and always runs.
      // discoveryCredentialsEncrypted is a flat map of provider id -> that
      // provider's own JSON-stringified credentials (provider-agnostic
      // blob) — this reads only the "GOOGLE" entry, never anything else.
      const byProvider = profile.discoveryCredentialsEncrypted
        ? decryptCredentials(this.appConfig.values.jwt.accessSecret, profile.discoveryCredentialsEncrypted)
        : null;
      const googleCredentialJson = byProvider?.["GOOGLE"];
      if (!googleCredentialJson) {
        return {
          disabled: true,
          message: "مفتاح Google Places مش متسجل للشركة — سجّله من إعدادات الشركة أو بدّل لمزود OpenStreetMap المجاني.",
          found: 0,
          newCount: 0,
          prospects: [],
          warnings: [],
        };
      }
      // Same AES-GCM util + JWT-derived key as data-sources credentials.
      let apiKey: string;
      try {
        apiKey = (JSON.parse(googleCredentialJson) as { apiKey?: string }).apiKey ?? "";
      } catch {
        warnings.push("تعذر فك تشفير مفتاح Google Places — سجّل المفتاح من جديد في إعدادات الشركة.");
        return { found: 0, newCount: 0, prospects: [], warnings };
      }
      provider = new GooglePlacesProvider(apiKey);
    } else {
      provider = new OverpassProvider();
    }

    // The search body carries no period — score with the default 3m scope.
    const stats = await this.buildDiscoveryStats(user, { period: "3m" }, warnings);
    const { matched } = categoryForChannel(stats.repChannel);
    if (!matched) warnings.push("قناة عملائك غير معروفة — تم البحث بفئات التجارة التقليدية.");

    const searchResult = await provider.search({ lat: body.lat, lon: body.lon, radiusMeters: body.radiusMeters, channel: stats.repChannel });
    warnings.push(...searchResult.warnings);
    const places = searchResult.places.filter((pl) => isSaneCoordinate(pl.lat, pl.lon));
    const found = places.length;

    // A place within ~100m of an existing customer IS that customer — skip.
    const customerPoints: LatLon[] = stats.customers.filter((c) => c.lat !== null && c.lon !== null).map((c) => ({ lat: c.lat!, lon: c.lon! }));
    const fresh = places.filter((pl) => !customerPoints.some((cp) => haversineKm(cp, { lat: pl.lat, lon: pl.lon }) <= EXISTING_CUSTOMER_RADIUS_KM));

    // newCount = rows that did not exist before this search's upserts.
    // source is the discovering provider's own id — "OSM" or "GOOGLE" today,
    // any future provider id tomorrow — stored as free text (no enum, no
    // schema change needed to add a provider).
    const keys = fresh.map((pl) => pl.externalKey);
    const existing =
      keys.length > 0
        ? await this.prisma.prospect.findMany({
            where: { companyId: user.companyId!, source: provider.id, externalKey: { in: keys } },
            select: { externalKey: true },
          })
        : [];
    const existingKeys = new Set(existing.map((e) => e.externalKey));

    const saved: Prospect[] = [];
    for (const pl of fresh) {
      const facts = { name: pl.name, lat: pl.lat, lon: pl.lon, address: pl.address, phone: pl.phone };
      const row = await this.prisma.prospect.upsert({
        where: { companyId_source_externalKey: { companyId: user.companyId!, source: provider.id, externalKey: pl.externalKey } },
        create: {
          companyId: user.companyId!,
          source: provider.id,
          externalKey: pl.externalKey,
          channel: stats.repChannel,
          discoveredByUserId: user.userId,
          ...facts,
        },
        // Re-discovery refreshes provider facts only — status is live field
        // state and must never be reset here.
        update: facts,
      });
      saved.push(row);
    }

    const prospects = this.scoreProspects(saved, stats).sort((a, b) => b.priorityScore - a.priorityScore);
    return { found, newCount: keys.filter((key) => !existingKeys.has(key)).length, prospects, warnings };
  }

  // ------------------------------------------------------------------
  // 7) PATCH /visit-copilot/prospects/:id/status
  // ------------------------------------------------------------------

  async updateProspectStatus(user: AuthenticatedUser, prospectId: string, body: VisitCopilotProspectStatusRequest): Promise<Prospect> {
    const prospect = await this.prisma.prospect.findFirst({ where: { id: prospectId.trim(), companyId: user.companyId! } });
    // Another company's prospect is indistinguishable from a missing one.
    if (!prospect) throw new NotFoundException("العميل المحتمل غير موجود.");
    return this.prisma.prospect.update({ where: { id: prospect.id }, data: { status: body.status } });
  }

  // ------------------------------------------------------------------
  // 8) GET /visit-copilot/route-opportunities
  // ------------------------------------------------------------------

  async routeOpportunities(user: AuthenticatedUser, query: VisitCopilotDiscoveryQuery): Promise<RouteOpportunitiesResult> {
    const warnings: string[] = [];
    const stats = await this.buildDiscoveryStats(user, query, warnings);
    const rows = await this.prisma.prospect.findMany({ where: { companyId: user.companyId!, status: "NEW" } });
    // Only NEW prospects near the rep's territory qualify for the card.
    const nearby = this.scoreProspects(rows, stats).filter((p) => p.distanceKm !== null && p.distanceKm <= ROUTE_OPPORTUNITY_RADIUS_KM);
    const best: RouteOpportunityBest[] = [...nearby]
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, BEST_OPPORTUNITIES_LIMIT)
      .map((p) => {
        // Detour estimate: out-and-back to the prospect at the same speed +
        // visit-duration assumptions as the daily brief.
        const addedKm = round2(2 * p.distanceKm!);
        return {
          id: p.id,
          name: p.name,
          expectedOrderValue: p.expectedOrderValue,
          addedKm,
          addedMinutes: round2((addedKm / AVERAGE_SPEED_KMH) * 60 + MINUTES_PER_VISIT),
        };
      });
    return {
      highCount: nearby.filter((p) => p.priorityScore >= ROUTE_OPPORTUNITY_HIGH_SCORE).length,
      mediumCount: nearby.filter((p) => p.priorityScore >= ROUTE_OPPORTUNITY_MEDIUM_SCORE && p.priorityScore < ROUTE_OPPORTUNITY_HIGH_SCORE).length,
      best,
      totalExpectedValue: round2(best.reduce((sum, b) => sum + b.expectedOrderValue, 0)),
      disabled: nearby.length === 0,
      warnings,
    };
  }

  // ------------------------------------------------------------------
  // 9) GET /visit-copilot/prospect-briefing/:id
  // ------------------------------------------------------------------

  async prospectBriefing(user: AuthenticatedUser, prospectId: string, query: VisitCopilotBriefingQuery): Promise<ProspectBriefingResult> {
    return this.buildProspectBriefing(user, prospectId, query);
  }

  // Same shape as buildBriefing so the briefing screen (and the chat
  // context) work unchanged: no history → zeros for sales/returns/
  // collections, topProducts borrowed from same-channel peers, and Arabic
  // guidance focused on opening the account with a first order.
  private async buildProspectBriefing(user: AuthenticatedUser, prospectId: string, opts: PeriodInput & { vanStock: boolean }): Promise<ProspectBriefingResult> {
    const prospect = await this.prisma.prospect.findFirst({ where: { id: prospectId.trim(), companyId: user.companyId! } });
    if (!prospect) throw new NotFoundException("العميل المحتمل غير موجود.");

    const ctx = this.rieContext(user);
    const range = resolveVisitCopilotPeriod(opts);
    const warnings: string[] = [];

    const customers = await this.requireCustomers(ctx);
    const [invoices, items, products, vanInventory] = await Promise.all([
      this.tryEntity(ctx, "Invoices", "الفواتير", warnings),
      this.tryEntity(ctx, "Invoice Items", "أصناف الفاتورة", warnings),
      this.tryEntity(ctx, "Products", "الأصناف", warnings),
      opts.vanStock ? this.tryEntity(ctx, "Van Inventory", "مخزون السيارة", warnings) : Promise.resolve([] as readonly EntityRecord[]),
    ]);

    const productNames = new Map<string, string>();
    for (const p of products) {
      const pCode = String(p.ProductCode ?? "").trim();
      if (pCode) productNames.set(pCode, String(p.ProductName ?? pCode));
    }

    // Peers: visible customers on the prospect's channel (loose match —
    // real data mixes labels). No channel → all visible customers.
    const channel = (prospect.channel ?? "").trim();
    const peerCodes = new Set<string>();
    for (const row of customers) {
      const c = String(row.CustomerCode ?? "").trim();
      if (!c) continue;
      const rowChannel = String(row.Channel ?? "").trim();
      if (channel === "" || (rowChannel !== "" && channelsLooselyMatch(rowChannel, channel))) peerCodes.add(c);
    }
    if (channel === "") warnings.push("العميل المحتمل بدون قناة (Channel) محددة — عُرضت أفضل أصناف كل عملاء نطاقك.");

    // In-period peer invoices → aggregate peer product demand.
    const invoiceMeta = new Map<string, string>(); // InvoiceNo → peer CustomerCode
    for (const inv of invoices) {
      const no = String(inv.InvoiceNo ?? "").trim();
      const cust = String(inv.CustomerCode ?? "").trim();
      const dateIso = isoDayOf(inv.InvoiceDate);
      if (!no || !cust || !dateIso || dateIso < range.from || dateIso > range.to || !peerCodes.has(cust)) continue;
      invoiceMeta.set(no, cust);
    }
    const peerProducts = new Map<string, { qty: number; value: number }>();
    for (const item of items) {
      const no = String(item.InvoiceNo ?? "").trim();
      if (!invoiceMeta.has(no)) continue;
      const pCode = String(item.ProductCode ?? "").trim();
      if (!pCode) continue;
      const agg = peerProducts.get(pCode) ?? { qty: 0, value: 0 };
      agg.qty += toFiniteNumber(item.Quantity) ?? 0;
      agg.value += toFiniteNumber(item.LineTotal) ?? 0;
      peerProducts.set(pCode, agg);
    }

    let ranked = Array.from(peerProducts.entries()).sort((a, b) => b[1].value - a[1].value);
    if (opts.vanStock) {
      if (vanInventory.length > 0) {
        const inVan = this.latestVanStockSet(vanInventory);
        ranked = ranked.filter(([pCode]) => inVan.has(pCode));
      } else {
        warnings.push("فلتر مخزون السيارة مفعّل لكن لا توجد بيانات مخزون — عُرضت الاقتراحات دون فلترة.");
      }
    }
    const topProducts: BriefingProduct[] = ranked
      .slice(0, TOP_PRODUCTS_LIMIT)
      .map(([pCode, agg]) => ({ productCode: pCode, productName: productNames.get(pCode) ?? pCode, qty: round2(agg.qty), value: round2(agg.value) }));

    // source is free text now (provider id or "UPLOAD") — anything that
    // isn't the literal upload marker was found by a discovery provider.
    const sourceLabel =
      prospect.source === "UPLOAD"
        ? "من ملف العملاء المحتملين"
        : prospect.source === "GOOGLE"
          ? "مكتشف عبر Google Places"
          : "مكتشف عبر OpenStreetMap";
    const top = topProducts[0] ?? null;
    const topOpportunity = top
      ? `عميل محتمل جديد (${sourceLabel}) — عملاء نفس القناة يشترون "${top.productName}" بكثافة، وهو مدخلك الأفضل لفتح التعامل.`
      : `عميل محتمل جديد (${sourceLabel}) — لا توجد بيانات أصناف كافية للمقارنة، ركّز على فتح التعامل وجمع المعلومات.`;
    const suggestedGoal = "هدف الزيارة: افتح التعامل بطلبية أولى ولو صغيرة وسجّل بيانات المحل كاملة.";
    const actions: string[] = ["قدّم نفسك والشركة واعرض قائمة الأصناف مع عرض افتتاحي"];
    if (top) actions.push(`ابدأ بعرض "${top.productName}" — الأكثر مبيعًا لدى عملاء نفس القناة`);
    if (!prospect.phone) actions.push("سجّل رقم هاتف المسؤول وبيانات المحل الأساسية");
    actions.push("حدّث حالة العميل المحتمل في التطبيق بعد الزيارة");

    return {
      customerCode: prospect.id,
      customerName: prospect.name,
      period: range,
      sales: { total: 0, invoiceCount: 0, trendPct: null },
      returns: { total: 0, rate: null },
      collections: { collected: 0, pending: 0, bounced: 0, oldestPendingDueDate: null },
      topProducts,
      missingProducts: [],
      topOpportunity,
      suggestedGoal,
      actions: actions.slice(0, 4),
      warnings,
      isProspect: true,
    };
  }

  // ------------------------------------------------------------------
  // Discovery internals
  // ------------------------------------------------------------------

  // One pass over visible Customers + in-period Invoices/Invoice Items:
  // per-customer avgOrderValue, the rep's dominant channel, and the
  // geographic centroid of the rep's customers (the prospect-distance
  // anchor). Same RIE scoping and join shape as the Phase 1 builders.
  private async buildDiscoveryStats(user: AuthenticatedUser, periodInput: PeriodInput, warnings: string[]): Promise<DiscoveryStats> {
    const ctx = this.rieContext(user);
    const range = resolveVisitCopilotPeriod(periodInput);
    const [customerRows, invoices, items] = await Promise.all([
      this.requireCustomers(ctx),
      this.tryEntity(ctx, "Invoices", "الفواتير", warnings),
      this.tryEntity(ctx, "Invoice Items", "أصناف الفاتورة", warnings),
    ]);

    const invoiceCustomer = new Map<string, string>(); // in-period InvoiceNo → CustomerCode
    const invoiceCountByCustomer = new Map<string, number>();
    for (const inv of invoices) {
      const no = String(inv.InvoiceNo ?? "").trim();
      const cust = String(inv.CustomerCode ?? "").trim();
      const dateIso = isoDayOf(inv.InvoiceDate);
      if (!no || !cust || !dateIso || dateIso < range.from || dateIso > range.to) continue;
      invoiceCustomer.set(no, cust);
      invoiceCountByCustomer.set(cust, (invoiceCountByCustomer.get(cust) ?? 0) + 1);
    }
    const salesByCustomer = new Map<string, number>();
    for (const item of items) {
      const cust = invoiceCustomer.get(String(item.InvoiceNo ?? "").trim());
      if (!cust) continue;
      salesByCustomer.set(cust, (salesByCustomer.get(cust) ?? 0) + (toFiniteNumber(item.LineTotal) ?? 0));
    }

    const statCustomers = customerRows
      .map((row) => {
        const code = String(row.CustomerCode ?? "").trim();
        const lat = toFiniteNumber(row.Latitude);
        const lon = toFiniteNumber(row.Longitude);
        const hasCoords = lat !== null && lon !== null && isSaneCoordinate(lat, lon);
        const invoiceCount = invoiceCountByCustomer.get(code) ?? 0;
        return {
          customerCode: code,
          name: String(row.CustomerName ?? code),
          lat: hasCoords ? lat : null,
          lon: hasCoords ? lon : null,
          channel: String(row.Channel ?? "").trim() || null,
          invoiceCount,
          avgOrderValue: invoiceCount > 0 ? round2((salesByCustomer.get(code) ?? 0) / invoiceCount) : 0,
        };
      })
      .filter((c) => c.customerCode !== "");

    // repChannel = most frequent non-empty Channel (case-insensitive
    // grouping, first-seen label kept for display).
    const channelCounts = new Map<string, { label: string; count: number }>();
    for (const c of statCustomers) {
      if (!c.channel) continue;
      const key = c.channel.toLowerCase();
      const entry = channelCounts.get(key) ?? { label: c.channel, count: 0 };
      entry.count++;
      channelCounts.set(key, entry);
    }
    let repChannel: string | null = null;
    let repChannelCount = 0;
    for (const { label, count } of channelCounts.values()) {
      if (count > repChannelCount) {
        repChannelCount = count;
        repChannel = label;
      }
    }

    const coords = statCustomers.filter((c) => c.lat !== null && c.lon !== null);
    const centroid: LatLon | null =
      coords.length > 0
        ? {
            lat: coords.reduce((sum, c) => sum + c.lat!, 0) / coords.length,
            lon: coords.reduce((sum, c) => sum + c.lon!, 0) / coords.length,
          }
        : null;

    return { range, customers: statCustomers, repChannel, centroid };
  }

  // expectedOrderValue anchor: median in-period avgOrderValue of visible
  // same-channel customers (loose match); no same-channel buyers → all
  // visible customers with invoices; nobody invoiced → 0.
  private medianAovForChannel(stats: DiscoveryStats, channel: string | null): number {
    const withOrders = stats.customers.filter((c) => c.invoiceCount > 0);
    const sameChannel = channel ? withOrders.filter((c) => c.channel !== null && channelsLooselyMatch(c.channel, channel)) : [];
    const pool = sameChannel.length > 0 ? sameChannel : withOrders;
    return round2(median(pool.map((c) => c.avgOrderValue)));
  }

  // Rule-based prospect scoring (no model call):
  //   successProbability = clamp(0.1..0.9, 0.5 + 0.2·channelMatch +
  //     0.3·proximity)  — proximity decays linearly to 0 at 10km from the
  //     rep-customer centroid;
  //   priorityScore 0-100 = 50% min-max-normalized expectedOrderValue +
  //     50% successProbability.
  private scoreProspects(prospects: Prospect[], stats: DiscoveryStats): ScoredProspect[] {
    const base = prospects.map((p) => {
      const hasCoords = p.lat !== null && p.lon !== null && isSaneCoordinate(p.lat, p.lon);
      const distanceKm = hasCoords && stats.centroid ? round2(haversineKm({ lat: p.lat!, lon: p.lon! }, stats.centroid)) : null;
      const channelMatch = p.channel !== null && p.channel.trim() !== "" && stats.repChannel !== null && channelsLooselyMatch(p.channel, stats.repChannel);
      const proximity = distanceKm === null ? 0 : 0.3 * Math.max(0, 1 - distanceKm / PROXIMITY_DECAY_KM);
      return {
        p,
        lat: hasCoords ? p.lat : null,
        lon: hasCoords ? p.lon : null,
        distanceKm,
        channelMatch,
        successProbability: round2(clamp(0.5 + (channelMatch ? 0.2 : 0) + proximity, 0.1, 0.9)),
        expectedOrderValue: this.medianAovForChannel(stats, p.channel),
      };
    });

    const eovs = base.map((b) => b.expectedOrderValue);
    const eovMin = eovs.length > 0 ? Math.min(...eovs) : 0;
    const eovMax = eovs.length > 0 ? Math.max(...eovs) : 0;

    return base.map((b) => {
      let reason: string;
      if (b.channelMatch && b.distanceKm !== null) {
        reason = `قناته مطابقة لقناتك وعلى بعد ${b.distanceKm} كم من مركز عملائك — طلب أول متوقع بقيمة ${b.expectedOrderValue}.`;
      } else if (b.channelMatch) {
        reason = `قناته مطابقة لقناتك — طلب أول متوقع بقيمة ${b.expectedOrderValue}.`;
      } else if (b.distanceKm !== null) {
        reason = `قريب من مركز عملائك (${b.distanceKm} كم) — طلب أول متوقع بقيمة ${b.expectedOrderValue}.`;
      } else {
        reason = `عميل محتمل جديد — طلب أول متوقع بقيمة ${b.expectedOrderValue}.`;
      }
      return {
        id: b.p.id,
        source: b.p.source,
        name: b.p.name,
        lat: b.lat,
        lon: b.lon,
        channel: b.p.channel,
        status: b.p.status,
        priorityScore: round2(100 * (0.5 * normalize(b.expectedOrderValue, eovMin, eovMax) + 0.5 * b.successProbability)),
        expectedOrderValue: b.expectedOrderValue,
        successProbability: b.successProbability,
        reason,
        distanceKm: b.distanceKm,
      };
    });
  }

  // Products present (Quantity > 0) in the latest Van Inventory report —
  // same latest-report semantics as the Phase 1 van stock filter.
  private latestVanStockSet(vanInventory: readonly EntityRecord[]): Set<string> {
    let latestIso: string | null = null;
    for (const row of vanInventory) {
      const dIso = isoDayOf(row.ReportDate);
      if (dIso && (!latestIso || dIso > latestIso)) latestIso = dIso;
    }
    const inVan = new Set<string>();
    for (const row of vanInventory) {
      const dIso = isoDayOf(row.ReportDate);
      const pCode = String(row.ProductCode ?? "").trim();
      if (dIso === latestIso && pCode && (toFiniteNumber(row.Quantity) ?? 0) > 0) inVan.add(pCode);
    }
    return inVan;
  }
}
