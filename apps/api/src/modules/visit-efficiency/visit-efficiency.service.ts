import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type VisitEfficiencyRieQueryInput,
  type VisitEfficiencyResult,
  type VisitEfficiencyScopeField,
  type VisitEfficiencyValuesResult,
} from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";
import { haversineKm } from "../route-planning/route-balancer.util";

type SheetRow = Record<string, unknown>;

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

function toEpochMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function toDateKey(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim() !== "") {
    const t = Date.parse(value);
    if (Number.isNaN(t)) return value.trim();
    return new Date(t).toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

interface VisitRow {
  rep: string;
  dateKey: string;
  customerId: string;
  timeSort: number; // epoch ms of CheckInTime, or the row's original index as a fallback
  lat: number | null;
  lon: number | null;
}

// Migration #6 (ADR-001 / RIE Migration Plan, 2026-07-17) — RIE-backed, no
// file/column mapping. FilesService is no longer a dependency of this
// service.
//
// Rep identity: the Canonical Visits entity has no rep/employee field of
// its own (see Import Templates Spec §6.10 / canonical-entities.data.ts) —
// rep is derived via a two-hop join, Visits.RouteID -> Routes.SalesRepID ->
// Employees.EmployeeName. This mirrors REL-DER-002 ("Visit_ConductedBy") in
// the Relationship Registry, whose full definition is a time-aware lookup
// through Route Assignment history as-of VisitDate. That intermediate
// entity ("Route Assignments") has no data-source mapping anywhere on the
// platform yet (ENTITY_DATASET_TYPE_MAP marks it UNMAPPED — no uploaded
// dataset and no Prisma table), so this service resolves the simpler,
// available half of that relationship: Routes' CURRENT SalesRepID (same
// "current state" resolution already used by the Route hierarchy filter,
// Task #138) rather than a historical-as-of-date lookup. This is disclosed
// in the completion report, not silently approximated.
//
// Coordinates: prefer Visits.Latitude/Longitude directly when present and
// sane; otherwise fall back to the joined Customer's Latitude/Longitude via
// CustomerCode. Automatic, per-row — replaces the old manual
// direct-vs-join toggle (itself a Manual Mapping concern) with RIE always
// trying the best available source.
@Injectable()
export class VisitEfficiencyService {
  constructor(private readonly rieFacade: RieFacade) {}

  private assertEntityAvailable(result: EntityQueryResult, arabicLabel: string): void {
    if (!result.available) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  // Every RIE read in this service must pass requestingUser — see the
  // identical comment in geo-intelligence.service.ts. Centralized here so
  // every call site in this file gets Hierarchy Row-Level Filtering the
  // same way instead of relying on each one to remember.
  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  // Visits.RouteID -> Routes.SalesRepID -> Employees.EmployeeName. Falls
  // back to the bare RouteID as the rep label when a route has no
  // SalesRepID or the employee record can't be found — visits stay usable
  // (not silently dropped) rather than failing the whole request over a
  // data-quality gap in Routes/Employees.
  private buildRepResolver(routesResult: EntityQueryResult, employeesResult: EntityQueryResult): (routeId: string) => string {
    const routeSalesRep = new Map<string, string>();
    for (const route of routesResult.records) {
      const routeId = String(route.RouteID ?? "").trim();
      const salesRepId = String(route.SalesRepID ?? "").trim();
      if (routeId && salesRepId) routeSalesRep.set(routeId, salesRepId);
    }
    const employeeName = new Map<string, string>();
    if (employeesResult.available) {
      for (const emp of employeesResult.records) {
        const id = String(emp.EmployeeID ?? "").trim();
        if (!id) continue;
        employeeName.set(id, String(emp.EmployeeName ?? id));
      }
    }
    return (routeId: string) => {
      const trimmedRouteId = routeId.trim();
      if (!trimmedRouteId) return "";
      const salesRepId = routeSalesRep.get(trimmedRouteId);
      if (!salesRepId) return trimmedRouteId;
      return employeeName.get(salesRepId) ?? salesRepId;
    };
  }

  async query(user: AuthenticatedUser, input: VisitEfficiencyRieQueryInput): Promise<VisitEfficiencyResult> {
    const ctx = this.rieContext(user);
    const [visitsResult, routesResult, employeesResult, customersResult] = await Promise.all([
      this.rieFacade.getEntityRecords("Visits", ctx),
      this.rieFacade.getEntityRecords("Routes", ctx),
      this.rieFacade.getEntityRecords("Employees", ctx),
      this.rieFacade.getEntityRecords("Customers", ctx),
    ]);
    this.assertEntityAvailable(visitsResult, "الزيارات");
    this.assertEntityAvailable(routesResult, "المسارات");
    this.assertEntityAvailable(customersResult, "العملاء");

    const resolveRep = this.buildRepResolver(routesResult, employeesResult);

    // Customer index for scope filtering + coordinate fallback.
    const customerById = new Map<string, SheetRow>();
    for (const c of customersResult.records) {
      const id = String(c.CustomerCode ?? "").trim();
      if (id && !customerById.has(id)) customerById.set(id, c as SheetRow);
    }

    let allowedCustomerIds: Set<string> | null = null;
    if (input.scopeField && input.scopeValues && input.scopeValues.length > 0) {
      const scopeSet = new Set(input.scopeValues);
      allowedCustomerIds = new Set();
      for (const [id, c] of customerById) {
        if (scopeSet.has(String(c[input.scopeField] ?? ""))) allowedCustomerIds.add(id);
      }
      if (allowedCustomerIds.size === 0) {
        throw new BadRequestException(`لا توجد بيانات مطابقة لـ ${input.scopeField} ضمن [${input.scopeValues.join(", ")}]`);
      }
    }

    const fromTime = input.dateFrom ? Date.parse(input.dateFrom) : null;
    const toTime = input.dateTo ? Date.parse(input.dateTo) : null;

    let usedTimeColumn = false;
    let excludedNoCoordinates = 0;

    const visitRows: VisitRow[] = [];
    let rowIndex = 0;
    for (const visit of visitsResult.records) {
      const customerId = String(visit.CustomerCode ?? "").trim();
      if (allowedCustomerIds && !allowedCustomerIds.has(customerId)) continue;

      const dateKey = toDateKey(visit.VisitDate) ?? "";
      if (fromTime !== null || toTime !== null) {
        const t = toEpochMs(visit.VisitDate);
        if (t === null) continue;
        if (fromTime !== null && t < fromTime) continue;
        if (toTime !== null && t > toTime) continue;
      }

      const routeId = String(visit.RouteID ?? "").trim();
      const rep = resolveRep(routeId);

      let lat = toFiniteNumber(visit.Latitude);
      let lon = toFiniteNumber(visit.Longitude);
      if (lat !== null && lon !== null && !isSaneCoordinate(lat, lon)) {
        lat = null;
        lon = null;
      }
      if (lat === null || lon === null) {
        const customer = customerById.get(customerId);
        if (customer) {
          const cLat = toFiniteNumber(customer.Latitude);
          const cLon = toFiniteNumber(customer.Longitude);
          if (cLat !== null && cLon !== null && isSaneCoordinate(cLat, cLon)) {
            lat = cLat;
            lon = cLon;
          }
        }
      }

      const checkInMs = toEpochMs(visit.CheckInTime);
      const timeSort = checkInMs !== null ? checkInMs : rowIndex;
      if (checkInMs !== null) usedTimeColumn = true;

      visitRows.push({ rep, dateKey, customerId, timeSort, lat, lon });
      rowIndex += 1;
    }

    // Group by rep-day.
    const groups = new Map<string, VisitRow[]>();
    for (const v of visitRows) {
      if (!v.rep || !v.dateKey) continue;
      const key = `${v.rep} ${v.dateKey}`;
      const list = groups.get(key);
      if (list) list.push(v);
      else groups.set(key, [v]);
    }

    const points: VisitEfficiencyResult["points"] = [];
    const repDistance = new Map<string, number>();
    const repVisits = new Map<string, number>();
    const repDays = new Map<string, Set<string>>();
    let usedVisits = 0;
    let excludedSingleVisitDays = 0;

    for (const [, list] of groups) {
      const withCoords = list.filter((v) => v.lat !== null && v.lon !== null);
      excludedNoCoordinates += list.length - withCoords.length;
      if (withCoords.length < 2) {
        if (list.length === 1) excludedSingleVisitDays += 1;
        continue;
      }
      withCoords.sort((a, b) => a.timeSort - b.timeSort);

      const rep = withCoords[0]!.rep;
      const days = repDays.get(rep) ?? new Set<string>();
      days.add(withCoords[0]!.dateKey);
      repDays.set(rep, days);

      for (let i = 0; i < withCoords.length; i++) {
        const cur = withCoords[i]!;
        const dist = i === 0 ? 0 : haversineKm({ lat: withCoords[i - 1]!.lat!, lon: withCoords[i - 1]!.lon! }, { lat: cur.lat!, lon: cur.lon! });
        points.push({ id: `${cur.customerId}-${i}`, label: cur.customerId, lat: cur.lat!, lon: cur.lon!, value: dist, rep: cur.rep, dateKey: cur.dateKey });
        repDistance.set(rep, (repDistance.get(rep) ?? 0) + dist);
        repVisits.set(rep, (repVisits.get(rep) ?? 0) + 1);
        usedVisits += 1;
      }
    }

    const repSummaries: VisitEfficiencyResult["repSummaries"] = Array.from(repVisits.keys())
      .map((rep) => {
        const totalVisits = repVisits.get(rep) ?? 0;
        const totalDistanceKm = repDistance.get(rep) ?? 0;
        return {
          rep,
          visitDays: repDays.get(rep)?.size ?? 0,
          totalVisits,
          totalDistanceKm,
          avgDistanceKmPerVisit: totalVisits > 0 ? totalDistanceKm / totalVisits : 0,
        };
      })
      .sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);

    return {
      usedVisits,
      excludedNoCoordinates,
      excludedSingleVisitDays,
      timeColumnUsed: usedTimeColumn,
      points,
      repSummaries,
    };
  }

  // RIE-backed dedicated dropdown endpoint for the scope field — same
  // pattern as Migrations #3/#4/#5's scope-values endpoints. Sourced from
  // Customers (scope fields are Customer attributes), not Visits.
  async scopeValues(user: AuthenticatedUser, scopeField: VisitEfficiencyScopeField): Promise<VisitEfficiencyValuesResult> {
    const customersResult = await this.rieFacade.getEntityRecords("Customers", this.rieContext(user));
    this.assertEntityAvailable(customersResult, "العملاء");
    const values = new Set<string>();
    for (const row of customersResult.records) {
      const v = String(row[scopeField] ?? "").trim();
      if (v) values.add(v);
    }
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }
}
