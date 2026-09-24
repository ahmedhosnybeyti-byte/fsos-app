import { strict as assert } from "node:assert";
import test from "node:test";
import type { Prisma } from "@field-sales-os/database";
import { haversineKm } from "../route-planning/route-balancer.util";
import { RieScalableQueryService } from "../rie/scalable-query.service";

interface TestPostgres {
  exec(sql: string): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}

type Row = Record<string, unknown>;
type LegacyResult = {
  usedVisits: number;
  excludedNoCoordinates: number;
  excludedSingleVisitDays: number;
  timeColumnUsed: boolean;
  points: Array<{ id: string; label: string; lat: number; lon: number; value: number; rep: string; dateKey: string }>;
  repSummaries: Array<{ rep: string; visitDays: number; totalVisits: number; totalDistanceKm: number; avgDistanceKmPerVisit: number }>;
};

function finite(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function epoch(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function dateKey(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value.trim() : new Date(parsed).toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function sane(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

function legacyVisitEfficiency(
  visits: Row[], routes: Row[], employees: Row[], customers: Row[],
  options: { scopeField?: "RouteID" | "City" | "CustomerClass" | "Channel"; scopeValues?: string[]; dateFrom?: string; dateTo?: string } = {},
): LegacyResult & { matchedScopeRows: number } {
  const routeSalesRep = new Map<string, string>();
  for (const route of routes) {
    const routeId = String(route.RouteID ?? "").trim();
    const salesRepId = String(route.SalesRepID ?? "").trim();
    if (routeId && salesRepId) routeSalesRep.set(routeId, salesRepId);
  }
  const employeeName = new Map<string, string>();
  for (const employee of employees) {
    const id = String(employee.EmployeeID ?? "").trim();
    if (id) employeeName.set(id, String(employee.EmployeeName ?? id));
  }
  const resolveRep = (routeId: string) => {
    const id = routeId.trim();
    if (!id) return "";
    const repId = routeSalesRep.get(id);
    return repId ? (employeeName.get(repId) ?? repId) : id;
  };
  const customerById = new Map<string, Row>();
  for (const customer of customers) {
    const id = String(customer.CustomerCode ?? "").trim();
    if (id && !customerById.has(id)) customerById.set(id, customer);
  }
  let allowedCustomers: Set<string> | null = null;
  if (options.scopeField && options.scopeValues?.length) {
    const scope = new Set(options.scopeValues);
    allowedCustomers = new Set([...customerById].flatMap(([id, row]) => scope.has(String(row[options.scopeField!] ?? "")) ? [id] : []));
  }
  const from = options.dateFrom ? Date.parse(options.dateFrom) : null;
  const to = options.dateTo ? Date.parse(options.dateTo) : null;
  let timeColumnUsed = false;
  let rowIndex = 0;
  const prepared: Array<{ rep: string; dateKey: string; customerId: string; timeSort: number; lat: number | null; lon: number | null }> = [];
  for (const visit of visits) {
    const customerId = String(visit.CustomerCode ?? "").trim();
    if (allowedCustomers && !allowedCustomers.has(customerId)) continue;
    const key = dateKey(visit.VisitDate) ?? "";
    if (from !== null || to !== null) {
      const time = epoch(visit.VisitDate);
      if (time === null) continue;
      if (from !== null && time < from) continue;
      if (to !== null && time > to) continue;
    }
    let lat = finite(visit.Latitude);
    let lon = finite(visit.Longitude);
    if (lat !== null && lon !== null && !sane(lat, lon)) [lat, lon] = [null, null];
    if (lat === null || lon === null) {
      const customer = customerById.get(customerId);
      const customerLat = finite(customer?.Latitude);
      const customerLon = finite(customer?.Longitude);
      if (customerLat !== null && customerLon !== null && sane(customerLat, customerLon)) [lat, lon] = [customerLat, customerLon];
    }
    const checkIn = epoch(visit.CheckInTime);
    if (checkIn !== null) timeColumnUsed = true;
    prepared.push({
      rep: resolveRep(String(visit.RouteID ?? "")), dateKey: key, customerId,
      timeSort: checkIn ?? rowIndex, lat, lon,
    });
    rowIndex += 1;
  }
  const groups = new Map<string, typeof prepared>();
  for (const visit of prepared) {
    if (!visit.rep || !visit.dateKey) continue;
    const key = `${visit.rep} ${visit.dateKey}`;
    const group = groups.get(key);
    if (group) group.push(visit); else groups.set(key, [visit]);
  }
  const points: LegacyResult["points"] = [];
  const repDistance = new Map<string, number>();
  const repVisits = new Map<string, number>();
  const repDays = new Map<string, Set<string>>();
  let excludedNoCoordinates = 0;
  let excludedSingleVisitDays = 0;
  for (const group of groups.values()) {
    const withCoordinates = group.filter((visit) => visit.lat !== null && visit.lon !== null);
    excludedNoCoordinates += group.length - withCoordinates.length;
    if (withCoordinates.length < 2) {
      if (group.length === 1) excludedSingleVisitDays += 1;
      continue;
    }
    withCoordinates.sort((left, right) => left.timeSort - right.timeSort);
    const rep = withCoordinates[0]!.rep;
    const days = repDays.get(rep) ?? new Set<string>();
    days.add(withCoordinates[0]!.dateKey);
    repDays.set(rep, days);
    for (let index = 0; index < withCoordinates.length; index += 1) {
      const current = withCoordinates[index]!;
      const distance = index === 0 ? 0 : haversineKm(
        { lat: withCoordinates[index - 1]!.lat!, lon: withCoordinates[index - 1]!.lon! },
        { lat: current.lat!, lon: current.lon! },
      );
      points.push({ id: `${current.customerId}-${index}`, label: current.customerId, lat: current.lat!, lon: current.lon!, value: distance, rep: current.rep, dateKey: current.dateKey });
      repDistance.set(rep, (repDistance.get(rep) ?? 0) + distance);
      repVisits.set(rep, (repVisits.get(rep) ?? 0) + 1);
    }
  }
  const repSummaries = [...repVisits.keys()].map((rep) => {
    const totalVisits = repVisits.get(rep) ?? 0;
    const totalDistanceKm = repDistance.get(rep) ?? 0;
    return { rep, visitDays: repDays.get(rep)?.size ?? 0, totalVisits, totalDistanceKm, avgDistanceKmPerVisit: totalVisits ? totalDistanceKm / totalVisits : 0 };
  }).sort((left, right) => right.totalDistanceKm - left.totalDistanceKm);
  return {
    usedVisits: points.length, excludedNoCoordinates, excludedSingleVisitDays, timeColumnUsed,
    matchedScopeRows: allowedCustomers?.size ?? customerById.size, points, repSummaries,
  };
}

function rounded(result: LegacyResult & { matchedScopeRows?: number }) {
  const round = (value: number) => Math.round(value * 1e10) / 1e10;
  return {
    ...result,
    points: result.points.map((point) => ({ ...point, value: round(point.value) })),
    repSummaries: result.repSummaries.map((summary) => ({
      ...summary,
      totalDistanceKm: round(summary.totalDistanceKm),
      avgDistanceKmPerVisit: round(summary.avgDistanceKmPerVisit),
    })),
  };
}

test("Visit Efficiency set-based SQL has exact legacy parity and returns only the compact result", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE to run PostgreSQL regression tests",
}, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!) as { PGlite: new () => TestPostgres };
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE rie_canonical_entity_rows (
      id text PRIMARY KEY, company_id text NOT NULL, source_file_id text,
      entity_name text NOT NULL, entity_key text NOT NULL, precedence integer NOT NULL,
      data jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ON rie_canonical_entity_rows(company_id, entity_name);
  `);
  let sequence = 0;
  const insert = async (company: string, entity: string, data: Row, precedence = 1) => {
    sequence += 1;
    await db.query(
      "INSERT INTO rie_canonical_entity_rows (id, company_id, entity_name, entity_key, precedence, data, created_at) VALUES ($1, $2, $3, $1, $4, $5::jsonb, $6)",
      [`row-${sequence.toString().padStart(3, "0")}`, company, entity, precedence, JSON.stringify(data), `2026-01-01T00:00:${sequence.toString().padStart(2, "0")}Z`],
    );
  };
  await insert("visit-company", "Customers", { CustomerCode: " C-1 ", RouteID: "R-1", City: "North", CustomerClass: "A", Channel: "Retail", Latitude: "24.700", Longitude: "46.700" });
  await insert("visit-company", "Customers", { CustomerCode: "C-1", RouteID: "R-1", City: "South", CustomerClass: "B", Channel: "Other", Latitude: 29, Longitude: 49 });
  await insert("visit-company", "Customers", { CustomerCode: "C-2", RouteID: "R-1", City: "North", CustomerClass: "A", Channel: "Retail", Latitude: "24.710", Longitude: "46.710" });
  await insert("visit-company", "Customers", { CustomerCode: "C-3", RouteID: "R-1", City: "North", CustomerClass: "A", Channel: "Retail", Latitude: 0, Longitude: 0 });
  await insert("visit-company", "Customers", { CustomerCode: "C-4", RouteID: "R-3", City: "North", CustomerClass: "A", Channel: "Wholesale", Latitude: "24.730", Longitude: "46.730" });
  await insert("visit-company", "Customers", { CustomerCode: "C-X", RouteID: "R-2", City: "North", Latitude: 25, Longitude: 47 });
  await insert("visit-company", "Routes", { RouteID: "R-1", SalesRepID: "E-1" });
  await insert("visit-company", "Routes", { RouteID: "R-1", SalesRepID: "E-2" });
  await insert("visit-company", "Routes", { RouteID: "R-3", SalesRepID: "E-3" });
  await insert("visit-company", "Routes", { RouteID: "R-3", SalesRepID: "" });
  await insert("visit-company", "Routes", { RouteID: "R-2", SalesRepID: "E-X" });
  await insert("visit-company", "Employees", { EmployeeID: "E-2", EmployeeName: "Rep Initial" });
  await insert("visit-company", "Employees", { EmployeeID: "E-2", EmployeeName: "Rep Final" });
  await insert("visit-company", "Employees", { EmployeeID: "E-3", EmployeeName: "Rep Three" });
  await insert("visit-company", "Visits", { VisitID: "V-1", CustomerCode: "C-1", RouteID: "R-1", VisitDate: "2026-01-10", CheckInTime: "2026-01-10T09:00:00Z", Latitude: 24.701, Longitude: 46.701 });
  await insert("visit-company", "Visits", { VisitID: "V-2", CustomerCode: "C-2", RouteID: "R-1", VisitDate: "2026-01-10", CheckInTime: "2026-01-10T08:00:00Z" });
  await insert("visit-company", "Visits", { VisitID: "V-3", CustomerCode: "C-3", RouteID: "R-1", VisitDate: "2026-01-10", CheckInTime: "2026-01-10T10:00:00Z" });
  await insert("visit-company", "Visits", { VisitID: "V-4", CustomerCode: "C-4", RouteID: "R-3", VisitDate: "2026-01-11", Latitude: 24.73, Longitude: 46.73 });
  await insert("visit-company", "Visits", { VisitID: "V-5", CustomerCode: "C-1", RouteID: "R-3", VisitDate: "2026-01-12" });
  await insert("visit-company", "Visits", { VisitID: "V-6", CustomerCode: "C-2", RouteID: "R-3", VisitDate: "2026-01-12" });
  await insert("visit-company", "Visits", { VisitID: "V-7", CustomerCode: "C-X", RouteID: "R-2", VisitDate: "2026-01-10", Latitude: 25, Longitude: 47 });
  await insert("visit-company", "Visits", { VisitID: "V-8", CustomerCode: "C-1", RouteID: "R-1", VisitDate: "not-a-date", Latitude: 24.7, Longitude: 46.7 });
  await insert("other-company", "Customers", { CustomerCode: "OTHER", RouteID: "R-1", City: "North", Latitude: 10, Longitude: 10 });
  await insert("other-company", "Routes", { RouteID: "R-1", SalesRepID: "OTHER" });
  await insert("other-company", "Employees", { EmployeeID: "OTHER", EmployeeName: "Other Rep" });
  await insert("other-company", "Visits", { VisitID: "OTHER", CustomerCode: "OTHER", RouteID: "R-1", VisitDate: "2026-01-10", Latitude: 10, Longitude: 10 });

  const allowed = ["r-1", "r-3"];
  const ordered = async (entity: string, routeScoped: boolean) => (await db.query(`
    SELECT data FROM rie_canonical_entity_rows
    WHERE company_id = 'visit-company' AND entity_name = $1
      AND ($2::boolean = false OR LOWER(BTRIM(COALESCE(data ->> 'RouteID', ''))) = ANY($3::text[]))
    ORDER BY precedence ASC, created_at ASC, id ASC
  `, [entity, routeScoped, allowed])).rows.map((row) => row.data as Row);
  const [customers, routes, employees, visits] = await Promise.all([
    ordered("Customers", true), ordered("Routes", true), ordered("Employees", false), ordered("Visits", true),
  ]);
  let lastQuery: Prisma.Sql | undefined;
  const service = new RieScalableQueryService({
    $queryRaw: async (sql: Prisma.Sql) => {
      lastQuery = sql;
      return (await db.query(sql.text, sql.values)).rows;
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(allowed) } as never);
  const context = { companyId: "visit-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" } };

  await t.test("unscoped query matches duplicate, fallback, grouping and ordering semantics", async () => {
    const expected = legacyVisitEfficiency(visits, routes, employees, customers);
    const actual = await service.queryVisitEfficiency(context);
    assert.deepEqual(rounded(actual), rounded(expected));
    assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|visit_source\.\*|customer_source\.\*|route_source\.\*|employee_source\.\*/);
    assert.match(lastQuery!.text, /JSONB_AGG|GROUP BY group_key|LAG\(/);
  });

  await t.test("customer scope and date bounds match the legacy result after hierarchy and company scope", async () => {
    const options = { scopeField: "City" as const, scopeValues: ["North"], dateFrom: "2026-01-10", dateTo: "2026-01-11T23:59:59Z" };
    const expected = legacyVisitEfficiency(visits, routes, employees, customers, options);
    const actual = await service.queryVisitEfficiency({
      ...context, scopeField: options.scopeField, scopeValues: options.scopeValues,
      requireValidDate: true, fromTime: Date.parse(options.dateFrom), toTime: Date.parse(options.dateTo),
    });
    assert.deepEqual(rounded(actual), rounded(expected));
    assert.equal(actual.matchedScopeRows, 4);
    assert.ok(actual.points.every((point) => point.label !== "C-X" && point.label !== "OTHER"));
  });

  await t.test("supplying an invalid date bound still excludes unparseable visit dates", async () => {
    const options = { dateFrom: "invalid" };
    const expected = legacyVisitEfficiency(visits, routes, employees, customers, options);
    const actual = await service.queryVisitEfficiency({ ...context, requireValidDate: true });
    assert.deepEqual(rounded(actual), rounded(expected));
  });
});
