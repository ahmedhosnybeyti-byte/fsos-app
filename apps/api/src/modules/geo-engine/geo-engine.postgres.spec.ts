import { strict as assert } from "node:assert";
import test from "node:test";
import type { Prisma } from "@field-sales-os/database";
import { RieScalableQueryService } from "../rie/scalable-query.service";
import type { RieGeoEngineKpi, RieGeoEngineMapQuery, RieGeoEngineTableQuery } from "../rie/scalable-query.types";

interface TestPostgres {
  exec(sql: string): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}
type Row = Record<string, unknown>;
type Customer = { code: string; name: string; city: string; channel: string; branchId: string; routeId: string; lat: number | null; lon: number | null; order: number; repEmail: string | null; repName: string | null; supervisorEmail: string | null; supervisorName: string | null };
type Sale = { invoiceNo: string; lineNo: number; time: number; customerCode: string; productCode: string; amount: number; order: number };

const number = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const epoch = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};
const key = (value: unknown) => String(value ?? "").trim();
const slug = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9؀-ۿ-]/g, "");

function legacyDimensions(input: { customers: Row[]; routes: Row[]; employees: Row[]; products: Row[] }) {
  const routes = new Map<string, string>();
  for (const row of input.routes) { const route = key(row.RouteID), rep = key(row.SalesRepID); if (route && rep) routes.set(route, rep); }
  const employees = new Map<string, { name: string; email: string; managerId: string | null }>();
  for (const row of input.employees) {
    const id = key(row.EmployeeID); if (!id) continue;
    employees.set(id, { name: String(row.EmployeeName ?? id), email: key(row.Email) || id, managerId: key(row.DirectManagerID) || null });
  }
  const customers = new Map<string, Customer>();
  let order = 0;
  for (const row of input.customers) {
    const code = key(row.CustomerCode); if (!code) continue;
    const routeId = key(row.RouteID), repId = routes.get(routeId), rep = repId ? employees.get(repId) : undefined, manager = rep?.managerId ? employees.get(rep.managerId) : undefined;
    const resolved = routeId === "" ? null : repId === undefined
      ? { email: routeId, name: routeId, supervisorEmail: null, supervisorName: null }
      : rep === undefined
        ? { email: repId, name: repId, supervisorEmail: null, supervisorName: null }
        : { email: rep.email, name: rep.name, supervisorEmail: manager?.email ?? null, supervisorName: manager?.name ?? null };
    const first = customers.get(code)?.order ?? order;
    customers.set(code, { code, name: String(row.CustomerName ?? code), city: key(row.City), channel: key(row.Channel), branchId: key(row.BranchID), routeId, lat: number(row.Latitude), lon: number(row.Longitude), order: first, repEmail: resolved?.email ?? null, repName: resolved?.name ?? null, supervisorEmail: resolved?.supervisorEmail ?? null, supervisorName: resolved?.supervisorName ?? null });
    order++;
  }
  const products = new Map<string, { name: string; category: string; brand: string }>();
  for (const row of input.products) {
    const code = key(row.ProductCode); if (code) products.set(code, { name: String(row.ProductName ?? code), category: key(row.Category), brand: key(row.Brand) });
  }
  return { customers, products };
}

function scopedCustomers(customers: Map<string, Customer>, input: Partial<RieGeoEngineMapQuery>) {
  const includes = (values: readonly string[] | undefined, value: string | null) => !values?.length || (value !== null && values.includes(value));
  return new Map([...customers].filter(([, row]) => includes(input.cityValues, row.city) && includes(input.channelValues, row.channel)
    && includes(input.branchIds, row.branchId) && includes(input.customerCodes, row.code) && includes(input.repEmails, row.repEmail)
    && includes(input.supervisorEmails, row.supervisorEmail)));
}

function legacySales(invoices: Row[], items: Row[], from: number, to: number, aggregate: boolean): Sale[] {
  const grouped = new Map<string, Sale>();
  let order = 0;
  for (const invoice of invoices) {
    const invoiceNo = key(invoice.InvoiceNo), customerCode = key(invoice.CustomerCode), time = epoch(invoice.InvoiceDate);
    if (!invoiceNo || !customerCode || time === null || time < from || time > to) continue;
    for (const item of items) {
      if (key(item.InvoiceNo) !== invoiceNo) continue;
      const lineNo = aggregate ? 0 : (number(item.LineNo) ?? 0), productCode = key(item.ProductCode);
      const group = JSON.stringify([invoiceNo, lineNo, time, customerCode, productCode]);
      const current = grouped.get(group) ?? { invoiceNo, lineNo, time, customerCode, productCode, amount: 0, order: order++ };
      current.amount += number(item.LineTotal) ?? 0;
      grouped.set(group, current);
    }
  }
  return [...grouped.values()];
}

function productScoped(sale: Sale, products: Map<string, { name: string; category: string; brand: string }>, input: Partial<RieGeoEngineMapQuery>) {
  if (input.productCodes?.length && !input.productCodes.includes(sale.productCode)) return false;
  const product = products.get(sale.productCode);
  if (input.categoryValues?.length && (!product || !input.categoryValues.includes(product.category))) return false;
  if (input.brandValues?.length && (!product || !input.brandValues.includes(product.brand))) return false;
  return true;
}

function legacyMap(args: { input: RieGeoEngineMapQuery; dimensions: ReturnType<typeof legacyDimensions>; sales: Sale[]; collections: Row[]; returns: Row[]; visits: Row[] }) {
  const customers = scopedCustomers(args.dimensions.customers, args.input);
  const values = new Map<string, number>();
  const add = (code: string, value: number) => { if (customers.has(code)) values.set(code, (values.get(code) ?? 0) + value); };
  if (args.input.kpi === "sales" || args.input.kpi === "orders") {
    const orders = new Map<string, Set<string>>();
    for (const sale of args.sales) {
      if (sale.time < args.input.fromTime || sale.time > args.input.toTime || !customers.has(sale.customerCode) || !productScoped(sale, args.dimensions.products, args.input)) continue;
      if (args.input.kpi === "sales") add(sale.customerCode, sale.amount);
      else { const set = orders.get(sale.customerCode) ?? new Set<string>(); set.add(sale.invoiceNo); orders.set(sale.customerCode, set); }
    }
    for (const [code, invoices] of orders) values.set(code, invoices.size);
  } else if (args.input.kpi === "lostSales") {
    const prior = new Map<string, Map<string, number>>(), recent = new Map<string, Set<string>>();
    for (const sale of args.sales) {
      if (!customers.has(sale.customerCode) || !productScoped(sale, args.dimensions.products, args.input)) continue;
      if (sale.time >= args.input.priorFromTime && sale.time <= args.input.priorToTime) {
        const products = prior.get(sale.customerCode) ?? new Map<string, number>(); products.set(sale.productCode, (products.get(sale.productCode) ?? 0) + sale.amount); prior.set(sale.customerCode, products);
      }
      if (sale.time >= args.input.fromTime && sale.time <= args.input.toTime) { const products = recent.get(sale.customerCode) ?? new Set<string>(); products.add(sale.productCode); recent.set(sale.customerCode, products); }
    }
    for (const [code, products] of prior) { let value = 0; for (const [product, amount] of products) if (!recent.get(code)?.has(product)) value += amount; if (value > 0) values.set(code, value); }
  } else if (args.input.kpi !== "customers") {
    const config = args.input.kpi === "collections" ? { rows: args.collections, date: "CollectionDate", amount: "Amount" }
      : args.input.kpi === "returns" ? { rows: args.returns, date: "ReturnDate", amount: "TotalAmount" }
        : { rows: args.visits, date: "VisitDate", amount: null };
    for (const row of config.rows) { const time = epoch(row[config.date]); if (time !== null && time >= args.input.fromTime && time <= args.input.toTime) add(key(row.CustomerCode), config.amount ? (number(row[config.amount]) ?? 0) : 1); }
  }
  const points = [...customers.values()].flatMap((customer) => customer.lat === null || customer.lon === null || customer.lat < -90 || customer.lat > 90 || customer.lon < -180 || customer.lon > 180 || (customer.lat === 0 && customer.lon === 0) ? [] : [{ id: customer.code, name: customer.name, lat: customer.lat, lon: customer.lon, city: customer.city, value: args.input.kpi === "customers" ? 1 : (values.get(customer.code) ?? 0), order: customer.order }]);
  const finalPoints = args.input.groupBy === "customer" ? points : [...points.reduce((map, point) => {
    const city = point.city || point.name, id = slug(city), value = map.get(id) ?? { id, name: city, lat: 0, lon: 0, city, value: 0, count: 0, order: point.order };
    value.lat += point.lat; value.lon += point.lon; value.value += point.value; value.count++; map.set(id, value); return map;
  }, new Map<string, { id: string; name: string; lat: number; lon: number; city: string; value: number; count: number; order: number }>()).values()].map(({ count, order, ...point }) => ({ ...point, lat: point.lat / count, lon: point.lon / count, order }));
  return { points: finalPoints.map(({ order, ...point }) => point), scopedCustomerCodes: [...customers.keys()], totalRows: customers.size, excludedBadCoordinates: customers.size - points.length, invoicesAvailable: true };
}

test("Geo Engine KPI-aware SQL preserves every legacy KPI and pages detail rows in PostgreSQL", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE to run PostgreSQL parity tests",
}, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!) as { PGlite: new () => TestPostgres };
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE rie_canonical_entity_rows (id text PRIMARY KEY, company_id text NOT NULL, source_file_id text, entity_name text NOT NULL, entity_key text NOT NULL, precedence integer NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX ON rie_canonical_entity_rows(company_id, entity_name);`);
  let sequence = 0;
  const insert = async (company: string, entity: string, data: Row, entityKey?: string) => { sequence++; await db.query("INSERT INTO rie_canonical_entity_rows (id,company_id,entity_name,entity_key,precedence,data,created_at) VALUES ($1,$2,$3,$4,1,$5::jsonb,$6)", [`row-${sequence.toString().padStart(3, "0")}`, company, entity, entityKey ?? `key-${sequence.toString().padStart(3, "0")}`, JSON.stringify(data), `2026-01-01T00:${sequence.toString().padStart(2, "0")}:00Z`]); };
  await insert("geo-company", "Customers", { CustomerCode: "C-1", CustomerName: "Old", City: "Riyadh", Channel: "Retail", BranchID: "B-1", RouteID: "R-1", Latitude: 24, Longitude: 46 }, "cust-001");
  await insert("geo-company", "Customers", { CustomerCode: " C-1 ", CustomerName: "Customer One", City: " Riyadh ", Channel: "Retail", BranchID: "B-1", RouteID: "R-1", Latitude: "24.5", Longitude: "46.5" }, "cust-002");
  await insert("geo-company", "Customers", { CustomerCode: "C-2", CustomerName: "Customer Two", City: "Jeddah", Channel: "Wholesale", BranchID: "B-2", RouteID: "R-1", Latitude: 21.5, Longitude: 39.2 }, "cust-003");
  await insert("geo-company", "Customers", { CustomerCode: "C-3", CustomerName: null, City: "Riyadh", Channel: "Retail", BranchID: "B-1", RouteID: "R-1", Latitude: 0, Longitude: 0 }, "cust-004");
  await insert("geo-company", "Customers", { CustomerCode: "C-X", CustomerName: "Outside", City: "Riyadh", RouteID: "R-2", Latitude: 25, Longitude: 47 }, "cust-005");
  await insert("geo-company", "Customers", { CustomerCode: "", CustomerName: "Blank", RouteID: "R-1", Latitude: 20, Longitude: 30 }, "cust-006");
  await insert("geo-company", "Routes", { RouteID: "R-1", SalesRepID: "E-1" }, "route-001");
  await insert("geo-company", "Routes", { RouteID: "R-2", SalesRepID: "E-X" }, "route-002");
  await insert("geo-company", "Employees", { EmployeeID: "E-1", EmployeeName: "Rep One", Email: "rep@example.test", DirectManagerID: "M-1" }, "employee-001");
  await insert("geo-company", "Employees", { EmployeeID: "M-1", EmployeeName: "Supervisor", Email: "sup@example.test" }, "employee-002");
  await insert("geo-company", "Products", { ProductCode: "P-1", ProductName: "Old Product", Category: "Old", Brand: "Old" }, "product-001");
  await insert("geo-company", "Products", { ProductCode: "P-1", ProductName: "Product One", Category: "Core", Brand: "A" }, "product-002");
  await insert("geo-company", "Products", { ProductCode: "P-2", ProductName: "Product Two", Category: "Extra", Brand: "B" }, "product-003");
  await insert("geo-company", "Invoices", { InvoiceNo: "I-PRIOR", CustomerCode: "C-1", InvoiceDate: "2026-01-01", RouteID: "R-1" }, "invoice-001");
  await insert("geo-company", "Invoices", { InvoiceNo: "I-FROM", CustomerCode: "C-1", InvoiceDate: "2026-02-01", RouteID: "R-1" }, "invoice-002");
  await insert("geo-company", "Invoices", { InvoiceNo: "I-TO", CustomerCode: "C-2", InvoiceDate: "2026-02-28T23:59:59Z", RouteID: "R-1" }, "invoice-003");
  await insert("geo-company", "Invoices", { InvoiceNo: "I-X", CustomerCode: "C-X", InvoiceDate: "2026-02-10", RouteID: "R-2" }, "invoice-004");
  await insert("geo-company", "Invoice Items", { InvoiceNo: "I-PRIOR", LineNo: 1, ProductCode: "P-1", LineTotal: 100, RouteID: "R-1" }, "item-001");
  await insert("geo-company", "Invoice Items", { InvoiceNo: "I-FROM", LineNo: 1, ProductCode: "P-2", LineTotal: "40", RouteID: "R-1" }, "item-002");
  await insert("geo-company", "Invoice Items", { InvoiceNo: "I-FROM", LineNo: 1, ProductCode: "P-2", LineTotal: "10", RouteID: "R-1" }, "item-003");
  await insert("geo-company", "Invoice Items", { InvoiceNo: "I-TO", LineNo: 2, ProductCode: "P-1", LineTotal: "1,000", RouteID: "R-1" }, "item-004");
  await insert("geo-company", "Invoice Items", { InvoiceNo: "I-X", LineNo: 1, ProductCode: "P-1", LineTotal: 999, RouteID: "R-2" }, "item-005");
  await insert("geo-company", "Collections", { CustomerCode: "C-1", CollectionDate: "2026-02-01", Amount: "25", RouteID: "R-1" }, "collection-001");
  await insert("geo-company", "Collections", { CustomerCode: "C-2", CollectionDate: "2026-02-28T23:59:59Z", Amount: "1,000", RouteID: "R-1" }, "collection-002");
  await insert("geo-company", "Returns", { CustomerCode: "C-1", ReturnDate: "2026-02-15", TotalAmount: "5", RouteID: "R-1" }, "return-001");
  await insert("geo-company", "Visits", { CustomerCode: "C-1", VisitDate: "2026-02-01", RouteID: "R-1" }, "visit-001");
  await insert("geo-company", "Visits", { CustomerCode: "C-1", VisitDate: "2026-02-28T23:59:59Z", RouteID: "R-1" }, "visit-002");
  for (const entity of ["Customers", "Invoices", "Invoice Items", "Collections", "Returns", "Visits", "Products", "Routes", "Employees"]) await insert("other-company", entity, { CustomerCode: "OTHER", InvoiceNo: "OTHER", ProductCode: "OTHER", RouteID: "R-1", InvoiceDate: "2026-02-10", CollectionDate: "2026-02-10", ReturnDate: "2026-02-10", VisitDate: "2026-02-10", LineTotal: 999, Amount: 999, TotalAmount: 999, Latitude: 20, Longitude: 30 });

  const ordered = async (entity: string, hierarchy: boolean) => (await db.query(`SELECT data FROM rie_canonical_entity_rows WHERE company_id='geo-company' AND entity_name=$1 AND ($2::boolean=false OR LOWER(BTRIM(COALESCE(data->>'RouteID','')))='r-1') ORDER BY entity_key`, [entity, hierarchy])).rows.map((row) => row.data as Row);
  const [customers, routes, employees, products, invoices, items, collections, returns, visits] = await Promise.all([ordered("Customers", true), ordered("Routes", true), ordered("Employees", false), ordered("Products", false), ordered("Invoices", true), ordered("Invoice Items", true), ordered("Collections", true), ordered("Returns", true), ordered("Visits", true)]);
  const dimensions = legacyDimensions({ customers, routes, employees, products });
  const fromTime = Date.parse("2026-02-01T00:00:00Z"), toTime = Date.parse("2026-02-28T23:59:59Z"), priorFromTime = Date.parse("2026-01-01T00:00:00Z"), priorToTime = Date.parse("2026-01-31T23:59:59Z");
  const sales = legacySales(invoices, items, Math.min(fromTime, priorFromTime), Math.max(toTime, priorToTime), true);
  let lastQuery: Prisma.Sql | undefined, queryCount = 0;
  const service = new RieScalableQueryService({ $queryRaw: async (sql: Prisma.Sql) => { lastQuery = sql; queryCount++; return (await db.query(sql.text, sql.values)).rows; } } as never, { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never);
  const common = { companyId: "geo-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" }, fromTime, toTime, priorFromTime, priorToTime, invoicesAvailable: true };
  const kpis: RieGeoEngineKpi[] = ["sales", "orders", "customers", "visits", "collections", "returns", "lostSales"];
  for (const kpi of kpis) for (const groupBy of ["customer", "city"] as const) {
    const input: RieGeoEngineMapQuery = { ...common, kpi, groupBy };
    const expected = legacyMap({ input, dimensions, sales, collections, returns, visits });
    const actual = await service.queryGeoEngineMap(input);
    assert.deepEqual(actual, expected, `${kpi}/${groupBy}`);
    const entities = new Set((lastQuery?.values ?? []).filter((value): value is string => typeof value === "string" && ["Invoices", "Invoice Items", "Collections", "Returns", "Visits"].includes(value)));
    const expectedFact = kpi === "sales" || kpi === "orders" || kpi === "lostSales" ? ["Invoices", "Invoice Items"] : kpi === "customers" ? [] : [kpi === "visits" ? "Visits" : kpi === "returns" ? "Returns" : "Collections"];
    assert.deepEqual([...entities].sort(), expectedFact.sort(), `${kpi} reads only its required fact`);
    assert.doesNotMatch(lastQuery!.text, /_source\.\*|rie_dataset_versions|rie_entity_rows/);
  }

  const filteredInput: RieGeoEngineMapQuery = { ...common, kpi: "sales", groupBy: "customer", cityValues: ["Riyadh"], branchIds: ["B-1"], customerCodes: ["C-1"], repEmails: ["rep@example.test"], supervisorEmails: ["sup@example.test"], categoryValues: ["Extra"], brandValues: ["B"], productCodes: ["P-2"] };
  assert.deepEqual(await service.queryGeoEngineMap(filteredInput), legacyMap({ input: filteredInput, dimensions, sales, collections, returns, visits }));

  const tableSales = legacySales(invoices, items, fromTime, toTime, false).filter((sale) => scopedCustomers(dimensions.customers, common).has(sale.customerCode) && productScoped(sale, dimensions.products, common)).sort((a, b) => b.time - a.time);
  const tableInput: RieGeoEngineTableQuery = { ...common, page: 2, pageSize: 1 };
  const table = await service.queryGeoEngineTable(tableInput);
  const expectedSale = tableSales[1]!; const customer = dimensions.customers.get(expectedSale.customerCode)!; const product = dimensions.products.get(expectedSale.productCode);
  assert.deepEqual(table, { totalRows: tableSales.length, rows: [{ invoiceNo: expectedSale.invoiceNo, lineNo: expectedSale.lineNo, date: new Date(expectedSale.time).toISOString(), customerCode: expectedSale.customerCode, customerName: customer.name, city: customer.city, channel: customer.channel, productCode: expectedSale.productCode, productName: product?.name ?? expectedSale.productCode, category: product?.category ?? "", brand: product?.brand ?? "", repName: customer.repName ?? "", supervisorName: customer.supervisorName ?? "", amount: expectedSale.amount }] });
  assert.equal(queryCount, kpis.length * 2 + 2);
  assert.match(lastQuery!.text, /LIMIT/);
  assert.doesNotMatch(lastQuery!.text, /_source\.\*|rie_dataset_versions|rie_entity_rows/);
});
