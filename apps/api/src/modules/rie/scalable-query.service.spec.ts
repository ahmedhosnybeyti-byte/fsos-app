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
    companyId: "company-1", entityName: "Invoice Items", projection: [{ field: "ProductCode" }],
    joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }],
    groupBy: [{ field: "ProductCode" }], aggregates: [{ op: "sum", field: "Quantity", as: "quantity" }],
    scope: { date: { field: "InvoiceDate", source: "invoice", to: "2026-08-31" }, product: { values: ["P-1"] } },
    preferHashedScopedSemiJoin: true, pagination: { limit: 1 },
  });
  const sql = captured?.strings?.join(" ") ?? "";
  assert.match(sql, /IN \(SELECT .* FROM invoice_active invoice_scope\)/);
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

test("management lost opportunities keeps both covered and uncovered rows and returns paged totals", async () => {
  let captured: { strings?: readonly string[]; values?: readonly unknown[] } | undefined;
  const service = new RieScalableQueryService({
    $queryRaw: async (query: typeof captured) => {
      captured = query;
      return [{
        affectedPersonCount: 1,
        affectedRouteCount: 1,
        lostOpportunityCount: 1,
        hasMore: false,
        topPeople: [{ responsibleEmployeeId: "M-1", responsibleEmployeeName: "Manager", lostOpportunityCount: 1, suggestedQuantity: 4 }],
        rows: [{
          responsibleEmployeeId: "M-1", responsibleEmployeeName: "Manager", routeId: "R-1",
          customerCode: "C-1", customerName: "Customer", productCode: "P-1", productName: "Product",
          category: "Food", baselineNetQuantity: 12, recentNetQuantity: 0, suggestedQuantity: 4, currentVanStock: 0,
        }],
      }];
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["R-1"]) } as never);

  const result = await service.queryManagementLostOpportunities({
    companyId: "company-1",
    requestingUser: { roleCode: "MANAGER", email: "manager@example.com" },
    targetDate: "2026-09-02",
    baselineFrom: "2026-05-06",
    baselineTo: "2026-08-03",
    recentFrom: "2026-08-04",
    recentTo: "2026-09-02",
    visitDays: ["Tuesday"],
    personLevel: "supervisor",
    pagination: { limit: 25, offset: 0 },
  });

  assert.deepEqual(result, {
    affectedPersonCount: 1,
    affectedRouteCount: 1,
    lostOpportunityCount: 1,
    topPeople: [{ responsibleEmployeeId: "M-1", responsibleEmployeeName: "Manager", lostOpportunityCount: 1, suggestedQuantity: 4 }],
    page: { limit: 25, offset: 0, hasMore: false },
    rows: [{
      responsibleEmployeeId: "M-1", responsibleEmployeeName: "Manager", routeId: "R-1",
      customerCode: "C-1", customerName: "Customer", productCode: "P-1", productName: "Product",
      category: "Food", baselineNetQuantity: 12, recentNetQuantity: 0, suggestedQuantity: 4, currentVanStock: 0,
    }],
  });
  const sql = captured?.strings?.join(" ") ?? "";
  assert.match(sql, /baseline_net_quantity > 0/);
  assert.match(sql, /recent_net_quantity = 0/);
  assert.doesNotMatch(sql, /COALESCE\(stock\.current_stock, 0\) <= 0/);
  assert.match(sql, /ROUND\(net\.baseline_net_quantity \/ 3\.0\) > 0/);
  assert.match(sql, /SUM\("suggestedQuantity"\).*"suggestedQuantity"/);
  assert.match(sql, /ORDER BY "suggestedQuantity" DESC, "responsibleEmployeeName"/);
  assert.match(sql, /LIMIT .* OFFSET/);
  assert.ok(captured?.values?.includes("R-1"));
  assert.ok(captured?.values?.includes("Tuesday"));
});
