import { strict as assert } from "node:assert";
import test from "node:test";
import type { Prisma } from "@field-sales-os/database";
import { RieScalableQueryService } from "../rie/scalable-query.service";

interface TestPostgres {
  exec(sql: string): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}

type Row = Record<string, unknown>;
const currentFromTime = Date.parse("2026-09-01T00:00:00Z");
const currentToTime = Date.parse("2026-09-24T12:00:00Z");
const priorFromTime = Date.parse("2026-08-01T00:00:00Z");
const priorToTime = Date.parse("2026-08-31T00:00:00Z");

function finite(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
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

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9؀-ۿ-]/g, "");
}

function legacySummaryFacts(customers: Row[], invoices: Row[], visits: Row[], situationCodes: string[]) {
  const territories = new Map<string, { name: string; codes: Set<string>; latSum: number; lonSum: number; coordCount: number }>();
  const customerTerritory = new Map<string, string>();
  for (const customer of customers) {
    const city = String(customer.City ?? "").trim();
    const code = String(customer.CustomerCode ?? "").trim();
    if (!city || !code) continue;
    const id = slugify(city);
    const territory = territories.get(id) ?? { name: city, codes: new Set<string>(), latSum: 0, lonSum: 0, coordCount: 0 };
    territories.set(id, territory);
    territory.codes.add(code);
    customerTerritory.set(code, id);
    const lat = finite(customer.Latitude);
    const lon = finite(customer.Longitude);
    if (lat !== null && lon !== null) {
      territory.latSum += lat;
      territory.lonSum += lon;
      territory.coordCount += 1;
    }
  }
  const sales = new Map<string, { current: number; prior: number; active: Set<string> }>();
  for (const invoice of invoices) {
    if (String(invoice.InvoiceStatus ?? "").trim() !== "Confirmed") continue;
    const code = String(invoice.CustomerCode ?? "").trim();
    const territoryId = customerTerritory.get(code);
    const time = epoch(invoice.InvoiceDate);
    if (!territoryId || time === null) continue;
    const value = sales.get(territoryId) ?? { current: 0, prior: 0, active: new Set<string>() };
    sales.set(territoryId, value);
    const amount = finite(invoice.TotalAfterVAT) ?? 0;
    if (time >= currentFromTime && time <= currentToTime) { value.current += amount; value.active.add(code); }
    if (time >= priorFromTime && time <= priorToTime) value.prior += amount;
  }
  const visited = new Map<string, Set<string>>();
  for (const visit of visits) {
    const code = String(visit.CustomerCode ?? "").trim();
    const territoryId = customerTerritory.get(code);
    const time = epoch(visit.VisitDate);
    if (!territoryId || time === null || time < currentFromTime || time > currentToTime) continue;
    const set = visited.get(territoryId) ?? new Set<string>();
    set.add(code);
    visited.set(territoryId, set);
  }
  return [...territories].map(([territoryId, territory]) => ({
    territoryId,
    name: territory.name,
    lat: territory.coordCount ? territory.latSum / territory.coordCount : 0,
    lon: territory.coordCount ? territory.lonSum / territory.coordCount : 0,
    customerCount: territory.codes.size,
    salesCurrent: sales.get(territoryId)?.current ?? 0,
    salesPrior: sales.get(territoryId)?.prior ?? 0,
    activeCurrentCount: sales.get(territoryId)?.active.size ?? 0,
    visitedCustomerCount: visited.get(territoryId)?.size ?? 0,
    situationCustomerCodes: territoryId
      ? [...new Set(situationCodes)].filter((code) => customerTerritory.get(code) === territoryId)
      : [],
  }));
}

function legacyCustomerFacts(customers: Row[], invoices: Row[], visits: Row[], collections: Row[], city?: string) {
  const selected = city === undefined ? customers : customers.filter((customer) => String(customer.City ?? "").trim() === city);
  const byCustomer = new Map<string, { customerId: string; customerName: string; latitude: number | null; longitude: number | null; salesCurrent: number; salesPrior: number; collectionCurrent: number; visitedCurrent: boolean }>();
  for (const customer of selected) {
    const code = String(customer.CustomerCode ?? "").trim();
    if (!code) continue;
    byCustomer.set(code, {
      customerId: code,
      customerName: String(customer.CustomerName ?? code),
      latitude: finite(customer.Latitude),
      longitude: finite(customer.Longitude),
      salesCurrent: 0,
      salesPrior: 0,
      collectionCurrent: 0,
      visitedCurrent: false,
    });
  }
  for (const invoice of invoices) {
    if (String(invoice.InvoiceStatus ?? "").trim() !== "Confirmed") continue;
    const customer = byCustomer.get(String(invoice.CustomerCode ?? "").trim());
    const time = epoch(invoice.InvoiceDate);
    if (!customer || time === null) continue;
    const amount = finite(invoice.TotalAfterVAT) ?? 0;
    if (time >= currentFromTime && time <= currentToTime) customer.salesCurrent += amount;
    if (time >= priorFromTime && time <= priorToTime) customer.salesPrior += amount;
  }
  for (const collection of collections) {
    const customer = byCustomer.get(String(collection.CustomerCode ?? "").trim());
    const time = epoch(collection.CollectionDate);
    if (!customer || time === null || time < currentFromTime || time > currentToTime) continue;
    customer.collectionCurrent += finite(collection.Amount) ?? 0;
  }
  for (const visit of visits) {
    const customer = byCustomer.get(String(visit.CustomerCode ?? "").trim());
    const time = epoch(visit.VisitDate);
    if (customer && time !== null && time >= currentFromTime && time <= currentToTime) customer.visitedCurrent = true;
  }
  return { totalCustomers: selected.length, rows: [...byCustomer.values()] };
}

test("Territory Intelligence compact SQL preserves the legacy Node fact semantics", {
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
  const insert = async (company: string, entity: string, data: Row) => {
    sequence += 1;
    await db.query(
      "INSERT INTO rie_canonical_entity_rows (id, company_id, entity_name, entity_key, precedence, data, created_at) VALUES ($1, $2, $3, $1, 1, $4::jsonb, $5)",
      [`row-${sequence.toString().padStart(3, "0")}`, company, entity, JSON.stringify(data), `2026-01-01T00:${sequence.toString().padStart(2, "0")}:00Z`],
    );
  };
  await insert("territory-company", "Customers", { CustomerCode: " C-1 ", CustomerName: "First", City: " North ", Latitude: 10, Longitude: 20, RouteID: "R-1" });
  await insert("territory-company", "Customers", { CustomerCode: "C-1", CustomerName: "Last", City: "South", Latitude: 20, Longitude: 30, RouteID: "R-1" });
  await insert("territory-company", "Customers", { CustomerCode: "C-2", CustomerName: "Two", City: "north", Latitude: null, Longitude: 22, RouteID: "R-1" });
  await insert("territory-company", "Customers", { CustomerCode: "", CustomerName: "Blank", City: "North", Latitude: 11, Longitude: 21, RouteID: "R-1" });
  await insert("territory-company", "Customers", { CustomerCode: "C-3", CustomerName: null, City: "الرياض", Latitude: "24.7", Longitude: "46.7", RouteID: "R-1" });
  await insert("territory-company", "Customers", { CustomerCode: "C-4", CustomerName: "Punctuation", City: "!!!", Latitude: 5, Longitude: 6, RouteID: "R-1" });
  await insert("territory-company", "Customers", { CustomerCode: "C-X", CustomerName: "Outside", City: "North", Latitude: 99, Longitude: 99, RouteID: "R-2" });
  await insert("territory-company", "Invoices", { InvoiceNo: "I-1", CustomerCode: "C-1", InvoiceStatus: "Confirmed", InvoiceDate: "2026-09-01", TotalAfterVAT: 100, RouteID: "R-1" });
  await insert("territory-company", "Invoices", { InvoiceNo: "I-1", CustomerCode: "C-1", InvoiceStatus: " Confirmed ", InvoiceDate: "2026-09-24T12:00:00Z", TotalAfterVAT: 50, RouteID: "R-1" });
  await insert("territory-company", "Invoices", { InvoiceNo: "I-2", CustomerCode: "C-1", InvoiceStatus: "Confirmed", InvoiceDate: "2026-08-31", TotalAfterVAT: "1,000.5", RouteID: "R-1" });
  await insert("territory-company", "Invoices", { InvoiceNo: "I-3", CustomerCode: "C-2", InvoiceStatus: "Confirmed", InvoiceDate: "2026-09-10", TotalAfterVAT: "2.5e1", RouteID: "R-1" });
  await insert("territory-company", "Invoices", { InvoiceNo: "I-4", CustomerCode: "C-2", InvoiceStatus: "confirmed", InvoiceDate: "2026-09-10", TotalAfterVAT: 999, RouteID: "R-1" });
  await insert("territory-company", "Invoices", { InvoiceNo: "I-5", CustomerCode: "C-2", InvoiceStatus: "Confirmed", InvoiceDate: "2026-08-31T12:00:00Z", TotalAfterVAT: 999, RouteID: "R-1" });
  await insert("territory-company", "Invoices", { InvoiceNo: "I-6", CustomerCode: "C-4", InvoiceStatus: "Confirmed", InvoiceDate: "2026-09-10", TotalAfterVAT: 777, RouteID: "R-1" });
  await insert("territory-company", "Invoices", { InvoiceNo: "I-X", CustomerCode: "C-X", InvoiceStatus: "Confirmed", InvoiceDate: "2026-09-10", TotalAfterVAT: 999, RouteID: "R-2" });
  await insert("territory-company", "Visits", { VisitID: "V-1", CustomerCode: "C-1", VisitDate: "2026-09-01", RouteID: "R-1" });
  await insert("territory-company", "Visits", { VisitID: "V-2", CustomerCode: "C-1", VisitDate: "2026-09-20", RouteID: "R-1" });
  await insert("territory-company", "Visits", { VisitID: "V-3", CustomerCode: "C-2", VisitDate: "", RouteID: "R-1" });
  await insert("territory-company", "Visits", { VisitID: "V-4", CustomerCode: "C-4", VisitDate: "2026-09-10", RouteID: "R-1" });
  await insert("territory-company", "Visits", { VisitID: "V-X", CustomerCode: "C-X", VisitDate: "2026-09-10", RouteID: "R-2" });
  await insert("territory-company", "Collections", { CollectionNo: "COL-1", CustomerCode: "C-1", CollectionDate: "2026-09-01", Amount: "50", RouteID: "R-1" });
  await insert("territory-company", "Collections", { CollectionNo: "COL-2", CustomerCode: "C-1", CollectionDate: "2026-09-24T12:00:00Z", Amount: "1,000", RouteID: "R-1" });
  await insert("territory-company", "Collections", { CollectionNo: "COL-3", CustomerCode: "C-2", CollectionDate: null, Amount: 999, RouteID: "R-1" });
  await insert("territory-company", "Collections", { CollectionNo: "COL-X", CustomerCode: "C-X", CollectionDate: "2026-09-10", Amount: 999, RouteID: "R-2" });
  for (const entity of ["Customers", "Invoices", "Visits", "Collections"]) {
    await insert("other-company", entity, entity === "Customers"
      ? { CustomerCode: "OTHER", City: "North", RouteID: "R-1" }
      : { CustomerCode: "OTHER", RouteID: "R-1", InvoiceStatus: "Confirmed", InvoiceDate: "2026-09-10", VisitDate: "2026-09-10", CollectionDate: "2026-09-10", TotalAfterVAT: 500, Amount: 500 });
  }

  const ordered = async (entity: string) => (await db.query(`
    SELECT data FROM rie_canonical_entity_rows
    WHERE company_id = 'territory-company' AND entity_name = $1
      AND LOWER(BTRIM(COALESCE(data ->> 'RouteID', ''))) = 'r-1'
    ORDER BY precedence ASC, created_at ASC, id ASC
  `, [entity])).rows.map((row) => row.data as Row);
  const [customers, invoices, visits, collections] = await Promise.all([
    ordered("Customers"), ordered("Invoices"), ordered("Visits"), ordered("Collections"),
  ]);
  let lastQuery: Prisma.Sql | undefined;
  const service = new RieScalableQueryService({
    $queryRaw: async (sql: Prisma.Sql) => {
      lastQuery = sql;
      return (await db.query(sql.text, sql.values)).rows;
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never);
  const common = {
    companyId: "territory-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" },
    currentFromTime, currentToTime, priorFromTime, priorToTime,
    invoicesAvailable: true, visitsAvailable: true,
  };

  await t.test("summary rows match legacy duplicate mapping, boundaries, grouping and ordering", async () => {
    const situationCodes = ["C-1", "C-2", "C-4", "C-1", "MISSING"];
    const actual = await service.queryTerritorySummary({ ...common, situationCustomerCodes: situationCodes });
    assert.deepEqual(actual, legacySummaryFacts(customers, invoices, visits, situationCodes));
    assert.ok(actual.length < customers.length + invoices.length + visits.length);
    assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|customer_source\.\*|invoice_source\.\*|visit_source\.\*/);
    assert.match(lastQuery!.text, /GROUP BY territory_id|COUNT\(DISTINCT invoice\.customer_code\)/);
  });

  await t.test("customer rows match legacy full-company and exact-city behavior", async () => {
    for (const city of [undefined, "North", "Missing"] as const) {
      const actual = await service.queryTerritoryCustomerFacts({ ...common, collectionsAvailable: true, city });
      assert.deepEqual(actual, legacyCustomerFacts(customers, invoices, visits, collections, city));
      assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|customer_source\.\*|invoice_source\.\*|visit_source\.\*|collection_source\.\*/);
    }
  });

  await t.test("unavailable optional facts produce zero compact facts without changing customer rows", async () => {
    const actual = await service.queryTerritoryCustomerFacts({
      ...common, invoicesAvailable: false, visitsAvailable: false, collectionsAvailable: false,
    });
    assert.equal(actual.totalCustomers, customers.length);
    assert.ok(actual.rows.every((row) => row.salesCurrent === 0 && row.salesPrior === 0 && row.collectionCurrent === 0 && !row.visitedCurrent));
  });
});
