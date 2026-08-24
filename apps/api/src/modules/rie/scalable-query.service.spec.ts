import { strict as assert } from "node:assert";
import test from "node:test";
import { RieScalableQueryService } from "./scalable-query.service";

test("scalable query sends scoped joins, grouping, aggregation, and pagination to PostgreSQL", async () => {
  let captured: { strings?: readonly string[]; values?: readonly unknown[] } | undefined;
  const service = new RieScalableQueryService({ $queryRaw: async (query: typeof captured) => { captured = query; return [{ customer: "C-1", sales: 10 }, { customer: "C-2", sales: 9 }]; } } as never, { resolveAllowedRouteIds: async () => new Set(["rt-1"]) } as never);
  const result = await service.query({ companyId: "company-1", requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" }, entityName: "Invoice Items", projection: [{ field: "CustomerCode", as: "customer" }], joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }], aggregates: [{ op: "sum", field: "LineTotal", as: "sales" }], groupBy: [{ field: "CustomerCode" }], scope: { date: { field: "InvoiceDate", source: "invoice", from: "2026-08-01", to: "2026-08-31" }, customer: { values: ["C-1"] } }, pagination: { limit: 1 } });
  assert.equal(result.records.length, 1);
  assert.equal(result.page.hasMore, true);
  const sql = captured?.strings?.join(" ") ?? "";
  assert.ok(sql.includes('"rie_entity_rows"'));
  assert.ok(sql.includes('AS MATERIALIZED'));
  assert.ok(sql.includes('base_active'));
  assert.ok(sql.includes('invoice_active'));
  assert.ok(sql.includes('base_version."is_active" = TRUE'));
  assert.ok(sql.includes('invoice_version."is_active" = TRUE'));
  assert.ok(captured?.values?.includes("company-1"));
  assert.ok(captured?.values?.includes("rt-1"));
});
test("scalable query rejects unsafe identifiers and empty scopes fail closed", async () => {
  const service = new RieScalableQueryService({ $queryRaw: async () => [] } as never, { resolveAllowedRouteIds: async () => null } as never);
  await assert.rejects(() => service.query({ companyId: "c", entityName: "Customers", projection: [{ field: "CustomerCode; DROP" }] }));
  assert.deepEqual((await service.query({ companyId: "c", entityName: "Customers", projection: [{ field: "CustomerCode" }], scope: { customer: { values: [] } } })).records, []);
});

test("scopes Customers.City through Invoices before Invoice Items", async () => {
  let captured: { strings?: readonly string[] } | undefined;
  const service = new RieScalableQueryService({ $queryRaw: async (query: typeof captured) => { captured = query; return []; } } as never, { resolveAllowedRouteIds: async () => null } as never);
  await service.query({
    companyId: "company-1", entityName: "Invoice Items", projection: [],
    joins: [
      { entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } },
      { entityName: "Customers", alias: "customer", on: { left: { field: "CustomerCode", source: "invoice" }, rightField: "CustomerCode" } },
    ],
    scope: { date: { field: "InvoiceDate", source: "invoice", from: "2026-08-01", to: "2026-08-31" }, fields: [{ field: "City", source: "customer", values: ["Riyadh"] }] },
    aggregates: [{ op: "sum", field: "LineTotal", as: "sales" }], pagination: { limit: 1 },
  });
  const sql = captured?.strings?.join(" ") ?? "";
  assert.ok(sql.indexOf("customer_active AS MATERIALIZED") < sql.indexOf("invoice_active AS MATERIALIZED"));
  assert.ok(sql.indexOf("invoice_active AS MATERIALIZED") < sql.indexOf("base_active AS MATERIALIZED"));
  assert.match(sql, /FROM customer_active customer_scope/);
  assert.match(sql, /invoice_source\."data" ->> 'CustomerCode'/);
});

test("hashed scoped semi-join compiles stale-style Invoice Items membership once", async () => {
  let captured: { strings?: readonly string[] } | undefined;
  const service = new RieScalableQueryService({ $queryRaw: async (query: typeof captured) => { captured = query; return []; } } as never, { resolveAllowedRouteIds: async () => null } as never);
  await service.query({
    companyId: "company-1", entityName: "Invoice Items", projection: [{ field: "ProductCode" }, { field: "CustomerCode", source: "invoice" }],
    joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }],
    groupBy: [{ field: "ProductCode" }, { field: "CustomerCode", source: "invoice" }], aggregates: [{ op: "maxText", field: "InvoiceDate", source: "invoice", as: "lastPurchaseDate" }],
    scope: { date: { field: "InvoiceDate", source: "invoice", to: "2026-08-31" }, product: { values: ["P-1"] } },
    preferHashedScopedSemiJoin: true, pagination: { limit: 1 },
  });
  const sql = captured?.strings?.join(" ") ?? "";
  assert.match(sql, /IN \(SELECT .* FROM invoice_active invoice_scope\)/);
});

test("positive base-row filter is applied before stale-style joins and aggregation", async () => {
  let captured: { strings?: readonly string[] } | undefined;
  const service = new RieScalableQueryService({ $queryRaw: async (query: typeof captured) => { captured = query; return []; } } as never, { resolveAllowedRouteIds: async () => null } as never);
  await service.query({
    companyId: "company-1", entityName: "Invoice Items", projection: [{ field: "ProductCode" }],
    joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }],
    groupBy: [{ field: "ProductCode" }], aggregates: [{ op: "sum", field: "Quantity", filterPositiveField: { field: "Quantity" }, as: "quantity" }],
    rowFilterPositiveField: { field: "Quantity" }, scope: { date: { field: "InvoiceDate", source: "invoice", to: "2026-08-31" } }, pagination: { limit: 1 },
  });
  const sql = captured?.strings?.join(" ") ?? "";
  assert.match(sql, /base_source\."data" ->> 'Quantity'.* > 0/);
});

test("scalable query supports distinct array aggregation without materializing facts", async () => {
  let captured: { strings?: readonly string[] } | undefined;
  const service = new RieScalableQueryService({ $queryRaw: async (query: typeof captured) => { captured = query; return [{ routeIds: ["R-1"] }]; } } as never, { resolveAllowedRouteIds: async () => null } as never);
  await service.query({ companyId: "company-1", entityName: "Collections", projection: [], aggregates: [{ op: "arrayAggDistinct", field: "RouteID", as: "routeIds" }], pagination: { limit: 1 } });
  assert.match(captured?.strings?.join(" ") ?? "", /ARRAY_AGG\(DISTINCT/);
});

test("scalable query keeps the latest snapshot per visible route before aggregation", async () => {
  let captured: { strings?: readonly string[] } | undefined;
  const service = new RieScalableQueryService({ $queryRaw: async (query: typeof captured) => { captured = query; return []; } } as never, { resolveAllowedRouteIds: async () => new Set(["R-1"]) } as never);
  await service.query({ companyId: "company-1", requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" }, entityName: "Van Inventory", projection: [{ field: "RouteID", as: "routeId" }, { field: "ProductCode", as: "productCode" }], latestPer: { partitionBy: { field: "RouteID" }, orderBy: { field: "ReportDate" } }, groupBy: [{ field: "RouteID" }, { field: "ProductCode" }], aggregates: [{ op: "sum", field: "Quantity", as: "quantity" }], pagination: { limit: 5_000 } });
  const sql = captured?.strings?.join(" ") ?? "";
  assert.match(sql, /base_latest AS MATERIALIZED/);
  assert.match(sql, /MAX\(NULLIF/);
  assert.match(sql, /FROM base_latest base/);
});
