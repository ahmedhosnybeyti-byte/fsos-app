import { strict as assert } from "node:assert";
import test from "node:test";
import { RieScalableQueryService } from "./scalable-query.service";
import { runWithRieRequestContext, setRieTelemetryTestSink } from "../../common/observability/rie-observability";
import { RieExecutionCoordinatorService } from "./rie-execution-coordinator.service";
import type { Prisma } from "@field-sales-os/database";
import type { RieVisitCopilotRouteExpectedSalesQuery } from "./scalable-query.types";

const scalableQueryInput = () => ({
  companyId: "company-1",
  entityName: "Customers",
  projection: [{ field: "CustomerCode" }],
  pagination: { limit: 1 },
});

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

test("process-wide RIE semaphore limits expensive raw queries to 20 and resumes queued requests", async () => {
  let active = 0;
  let maximumActive = 0;
  let executions = 0;
  const service = new RieScalableQueryService({
    $queryRaw: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      executions += 1;
      await delay(5);
      active -= 1;
      return [];
    },
  } as never, { resolveAllowedRouteIds: async () => null } as never);

  const results = await Promise.all(Array.from({ length: 34 }, () => service.query(scalableQueryInput())));

  assert.equal(results.length, 34);
  assert.equal(executions, 34); // current-state makes each request one PostgreSQL execution
  assert.ok(maximumActive <= 20, `expected at most 20 active raw queries, got ${maximumActive}`);
  assert.equal(active, 0);
});

test("process-wide RIE semaphore releases permits after raw-query errors", async () => {
  let shouldFail = true;
  const service = new RieScalableQueryService({
    $queryRaw: async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("expected raw query failure");
      }
      return [];
    },
  } as never, { resolveAllowedRouteIds: async () => null } as never);

  await assert.rejects(() => service.query(scalableQueryInput()), /expected raw query failure/);
  const result = await service.query(scalableQueryInput());
  assert.deepEqual(result.records, []);
});

test("cancelled and timed-out RIE queue waiters never execute and do not leak permits", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  const releases = Array.from({ length: 20 }, () => deferred<void>());
  const holders = releases.map((release, index) => coordinator.runRequest(`holder-${index}`, () => coordinator.execute("hold", () => release.promise)));
  await delay(0);

  let cancelledExecuted = false;
  const controller = new AbortController();
  const cancelled = coordinator.runRequest("cancelled", () => coordinator.execute("cancelled", async () => { cancelledExecuted = true; }, { signal: controller.signal }));
  controller.abort();
  await assert.rejects(() => cancelled, { name: "RieExecutionQueueCancelledError" });

  let timedOutExecuted = false;
  await assert.rejects(
    () => coordinator.runRequest("timed-out", () => coordinator.execute("timed-out", async () => { timedOutExecuted = true; }, { timeoutMs: 5 })),
    { name: "RieExecutionQueueTimeoutError" },
  );

  releases.forEach(({ resolve }) => resolve());
  await Promise.all(holders);
  let postCancellationExecuted = false;
  await coordinator.runRequest("post-cancellation", () => coordinator.execute("post-cancellation", async () => { postCancellationExecuted = true; }));
  assert.equal(cancelledExecuted, false);
  assert.equal(timedOutExecuted, false);
  assert.equal(postCancellationExecuted, true);
});

test("default RIE queue timeout permits a waiter held beyond the former 10-second limit", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  const releases = Array.from({ length: 20 }, () => deferred<void>());
  const holders = releases.map((release, index) => coordinator.runRequest(`long-holder-${index}`, () => coordinator.execute("hold", () => release.promise)));
  await delay(0);

  let executed = false;
  const queued = coordinator.runRequest("default-timeout", () => coordinator.execute("default-timeout", async () => { executed = true; }));
  const releaseTimer = setTimeout(() => releases.forEach(({ resolve }) => resolve()), 10_100);
  try {
    await queued;
    assert.equal(executed, true);
  } finally {
    clearTimeout(releaseTimer);
    releases.forEach(({ resolve }) => resolve());
    await Promise.all(holders);
  }
});

test("process-wide RIE semaphore and business work are fail-open when telemetry throws", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  const restore = setRieTelemetryTestSink(() => { throw new Error("expected telemetry failure"); });
  try {
    let executed = false;
    await runWithRieRequestContext({ traceId: "telemetry-failure", feature: "test", action: "test", routeTemplate: "/test" }, () =>
      coordinator.execute("logging-error", async () => { executed = true; }),
    );
    assert.equal(executed, true);
  } finally {
    restore();
  }
});

test("scalable query sends scoped joins, grouping, aggregation, and pagination to PostgreSQL", async () => {
  let captured: { strings?: readonly string[]; values?: readonly unknown[] } | undefined;
  const service = new RieScalableQueryService({ $queryRaw: async (query: typeof captured) => { captured = query; return [{ customer: "C-1", sales: 10 }, { customer: "C-2", sales: 9 }]; } } as never, { resolveAllowedRouteIds: async () => new Set(["rt-1"]) } as never);
  const result = await service.query({ companyId: "company-1", requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" }, entityName: "Invoice Items", projection: [{ field: "CustomerCode", as: "customer" }], joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }], aggregates: [{ op: "sum", field: "LineTotal", as: "sales" }], groupBy: [{ field: "CustomerCode" }], scope: { date: { field: "InvoiceDate", source: "invoice", from: "2026-08-01", to: "2026-08-31" }, customer: { values: ["C-1"] } }, pagination: { limit: 1 } });
  assert.equal(result.records.length, 1);
  assert.equal(result.page.hasMore, true);
  const sql = captured?.strings?.join(" ") ?? "";
  assert.ok(sql.includes('"rie_canonical_entity_rows"'));
  assert.ok(sql.includes('AS MATERIALIZED'));
  assert.ok(sql.includes('base_active'));
  assert.ok(sql.includes('invoice_active'));
  assert.doesNotMatch(sql, /rie_entity_rows|rie_dataset_versions|base_candidates|invoice_candidates/);
  assert.doesNotMatch(sql, /ROW_NUMBER\(\) OVER|MIN\(candidate_version\.precedence\) OVER/);
  assert.doesNotMatch(sql, /SELECT\s+(base|invoice)_source\.\*/);
  assert.match(sql, /base_source\."company_id"/);
  assert.match(sql, /invoice_source\."company_id"/);
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
    groupBy: [{ field: "ProductCode" }, { field: "CustomerCode", source: "invoice" }], aggregates: [{ op: "sum", field: "Quantity", as: "quantity" }],
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

test("geo product intelligence keeps invoice joins, exclusions, grouping and limits in PostgreSQL", async () => {
  let captured: { strings?: readonly string[] } | undefined;
  const service = new RieScalableQueryService({ $queryRaw: async (query: typeof captured) => { captured = query; return [{ sku: "P-1", name: "Product", category: null, totalQty: 2, totalValue: 20, customerCount: 1, totalRowsConsidered: 4, targetProductCount: 1 }]; } } as never, { resolveAllowedRouteIds: async () => null } as never);
  const result = await service.queryGeoProducts({ companyId: "company-1", customerIds: ["N-1"], excludeCustomerId: "T-1", topProductsLimit: 5 });
  assert.equal(result[0]?.sku, "P-1");
  const sql = captured?.strings?.join(" ") ?? "";
  assert.match(sql, /INNER JOIN invoice_active/);
  assert.match(sql, /GROUP BY j\.sku/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM target_skus/);
  assert.match(sql, /ORDER BY "totalValue" DESC/);
  assert.match(sql, /LIMIT/);
});

test("canonical current-state always uses the direct scoped query without newest-wins windowing", async () => {
  let captured: { strings?: readonly string[] } | undefined;
  const service = new RieScalableQueryService({
    $queryRaw: async (query: { strings?: readonly string[] }) => {
      captured = query;
      return [];
    },
  } as never, { resolveAllowedRouteIds: async () => null } as never);
  await service.query({ companyId: "company-1", entityName: "Visits", projection: [], aggregates: [{ op: "count", as: "count" }], scope: { route: { values: ["R-1"] } } });
  const sql = captured?.strings?.join(" ") ?? "";
  assert.match(sql, /base_active AS MATERIALIZED/);
  assert.doesNotMatch(sql, /base_candidates|base_versions|ROW_NUMBER\(\) OVER|MIN\(candidate_version\.precedence\) OVER/);
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
  assert.match(sql, /route_product_opportunities AS MATERIALIZED/);
  assert.match(sql, /opportunity\."opportunityQuantity" > COALESCE\(stock\.current_stock, 0\)/);
  assert.match(sql, /scoped_invoice_numbers AS MATERIALIZED/);
  assert.match(sql, /scoped_return_numbers AS MATERIALIZED/);
  assert.match(sql, /INNER JOIN scoped_invoice_numbers scoped_invoice/);
  assert.match(sql, /INNER JOIN scoped_return_numbers scoped_return/);
  assert.match(sql, /item_source\."data" ->> 'InvoiceNo'.*AS invoice_no/);
  assert.match(sql, /return_item_source\."data" ->> 'ReturnNo'.*AS return_no/);
  assert.match(sql, /ORDER BY gap DESC, "opportunityQuantity" DESC/);
  assert.match(sql, /LIMIT .* OFFSET/);
  assert.ok(captured?.values?.includes("r-1"));
  assert.ok(captured?.values?.includes("tuesday"));
});

test("Visit Copilot calculates final lost opportunities in PostgreSQL within company hierarchy scope", async () => {
  let captured: { strings?: readonly string[]; values?: readonly unknown[] } | undefined;
  const service = new RieScalableQueryService({
    $queryRaw: async (query: typeof captured) => {
      captured = query;
      return [{ positiveBaselineCount: 1, rows: [{ customerCode: "c-1", productCode: "p-1", productName: "Product", category: null, baselineNetQuantity: 12, recentNetQuantity: 0, suggestedQuantity: 4, expectedSales: 20 }] }];
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["R-1"]) } as never);

  const result = await service.queryVisitCopilotLostOpportunities({
    companyId: "company-1",
    requestingUser: { roleCode: "MANAGER", email: "manager@example.com" },
    customerCodes: ["C-1"],
    baselineFrom: "2026-05-06", baselineTo: "2026-08-03", recentFrom: "2026-08-04", recentTo: "2026-09-02",
  });

  assert.equal(result.positiveBaselineCount, 1);
  assert.equal(result.rows.length, 1);
  const sql = captured?.strings?.join(" ") ?? "";
  assert.match(sql, /scoped_invoice_numbers AS MATERIALIZED/);
  assert.match(sql, /scoped_return_numbers AS MATERIALIZED/);
  assert.match(sql, /positive_baseline AS MATERIALIZED/);
  assert.match(sql, /actual_visits AS MATERIALIZED/);
  assert.match(sql, /COUNT\(\*\)::integer actual_visit_count/);
  assert.match(sql, /baseline_sales_value/);
  assert.match(sql, /"expectedSales"/);
  assert.match(sql, /recent_net_quantity = 0/);
  assert.ok(captured?.values?.includes("r-1"));
  assert.ok(captured?.values?.includes("c-1"));
});

test("Visit Copilot route expected sales stays PostgreSQL-first and excludes Lost Opportunities", async () => {
  let captured: { strings?: readonly string[]; values?: readonly unknown[] } | undefined;
  const service = new RieScalableQueryService({
    $queryRaw: async (query: typeof captured) => {
      captured = query;
      return [{ expectedSalesTotal: 3_000 }];
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["R-1"]) } as never);

  const result = await service.queryVisitCopilotRouteExpectedSales({
    companyId: "company-1",
    requestingUser: { roleCode: "MANAGER", email: "manager@example.com" },
    customerCodes: ["C-1", "C-2"],
    from: "2026-07-01",
    to: "2026-09-30",
    planDate: "2026-10-06",
    visitCycleDays: 7,
  });

  assert.equal(result.expectedSalesTotal, 3_000);
  const sql = captured?.strings?.join(" ") ?? "";
  assert.match(sql, /invoice_quantities AS MATERIALIZED/);
  assert.match(sql, /return_quantities AS MATERIALIZED/);
  assert.match(sql, /effective_prices AS MATERIALIZED/);
  assert.match(sql, /net\.net_quantity \/ GREATEST/);
  assert.match(sql, /invoice_status IN \('confirmed', 'posted'\)/);
  assert.match(sql, /return_status IN \('confirmed', 'approved'\)/);
  assert.doesNotMatch(sql, /opportunit|actual_visits/);
  assert.ok(captured?.values?.includes("r-1"));
  assert.ok(captured?.values?.includes("c-1"));
  assert.ok(captured?.values?.includes("2026-07-01"));
  assert.ok(captured?.values?.includes("2026-10-06"));
  assert.ok(captured?.values?.includes(7));
});

test("route expected sales validates its contract and skips SQL for an empty customer scope", async () => {
  let executions = 0;
  const service = new RieScalableQueryService({
    $queryRaw: async () => { executions++; return []; },
  } as never, { resolveAllowedRouteIds: async () => null } as never);
  const input: RieVisitCopilotRouteExpectedSalesQuery = {
    companyId: "company", customerCodes: [], from: "2026-07-01", to: "2026-07-28",
    planDate: "2026-08-04", visitCycleDays: 7,
  };
  assert.deepEqual(await service.queryVisitCopilotRouteExpectedSales(input), { expectedSalesTotal: 0 });
  for (const visitCycleDays of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(service.queryVisitCopilotRouteExpectedSales({ ...input, visitCycleDays }), /positive visit cycle/);
  }
  await assert.rejects(service.queryVisitCopilotRouteExpectedSales({ ...input, planDate: "invalid" }), /invalid date/);
  await assert.rejects(service.queryVisitCopilotRouteExpectedSales({ ...input, companyId: " " }), /requires companyId/);
  assert.equal(executions, 0);
});

// Characterizes the current forecast, not a final business approval of its formula.
test("route forecast SQL preserves net weekly demand, effective prices and tenant/route scope", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE for in-memory SQL validation",
}, async (t) => {
  interface MemoryPostgres {
    exec(sql: string): Promise<unknown>;
    query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
    close(): Promise<void>;
  }
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!) as { PGlite: new () => MemoryPostgres };
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TEMP TABLE rie_canonical_entity_rows (
    id text PRIMARY KEY, company_id text NOT NULL, entity_name text NOT NULL,
    entity_key text NOT NULL, precedence bigint NOT NULL DEFAULT 1,
    data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  let sequence = 0;
  const insert = (entity: string, data: Record<string, unknown>, company = "company") => db.query(
    "INSERT INTO rie_canonical_entity_rows (id, company_id, entity_name, entity_key, data) VALUES ($1, $2, $3, $1, $4::jsonb)",
    [`row-${++sequence}`, company, entity, JSON.stringify(data)],
  );
  for (const company of ["company", "other-company"]) {
    for (const [customer, route] of [["C-1", "R-1"], ["C-2", "R-2"]]) {
      await insert("Customers", { CustomerCode: customer, RouteID: route, DefaultPriceListCode: "PL" }, company);
      await insert("Invoices", { InvoiceNo: customer, CustomerCode: customer, RouteID: route, InvoiceDate: "2026-07-01", InvoiceStatus: "Confirmed" }, company);
      await insert("Invoice Items", { InvoiceNo: customer, ProductCode: "P", Unit: "case", Quantity: 300 }, company);
      await insert("Returns", { ReturnNo: customer, CustomerCode: customer, RouteID: route, ReturnDate: "2026-07-28", Status: "Approved" }, company);
      await insert("Return Items", { ReturnNo: customer, ProductCode: "P", Unit: "case", Quantity: 20 }, company);
    }
    await insert("Price List", { PriceListCode: "PL", ProductCode: "P", Unit: "case", Status: "Active", StartDate: "2026-01-01", EndDate: "2026-07-31", PriceAfterVAT: 8 }, company);
    await insert("Price List", { PriceListCode: "PL", ProductCode: "P", Unit: "case", Status: "Active", StartDate: "2026-08-01", PriceAfterVAT: 10 }, company);
    await insert("Price List", { PriceListCode: "PL", ProductCode: "P", Unit: "case", Status: "Active", StartDate: "2026-09-01", PriceAfterVAT: 99 }, company);
  }
  for (const [invoiceNo, date, status] of [["cancelled", "2026-07-01", "Cancelled"], ["outside", "2026-06-30", "Confirmed"]]) {
    await insert("Invoices", { InvoiceNo: invoiceNo, CustomerCode: "C-1", RouteID: "R-1", InvoiceDate: date, InvoiceStatus: status });
    await insert("Invoice Items", { InvoiceNo: invoiceNo, ProductCode: "P", Unit: "case", Quantity: 999 });
  }
  await insert("Returns", { ReturnNo: "pending", CustomerCode: "C-1", RouteID: "R-1", ReturnDate: "2026-07-01", Status: "Pending" });
  await insert("Return Items", { ReturnNo: "pending", ProductCode: "P", Unit: "case", Quantity: 999 });
  let allowed: Set<string> | null = new Set(["r-1"]);
  const service = new RieScalableQueryService({
    $queryRaw: async (sql: Prisma.Sql) => (await db.query(sql.text, sql.values)).rows,
  } as never, { resolveAllowedRouteIds: async () => allowed } as never);
  const input: RieVisitCopilotRouteExpectedSalesQuery = {
    companyId: "company", requestingUser: { roleCode: "MANAGER", email: "manager@example.com" },
    customerCodes: ["C-1", "C-2"], from: "2026-07-01", to: "2026-07-28", planDate: "2026-08-04", visitCycleDays: 7,
  };
  const total = async (overrides: Partial<RieVisitCopilotRouteExpectedSalesQuery> = {}) =>
    (await service.queryVisitCopilotRouteExpectedSales({ ...input, ...overrides })).expectedSalesTotal;
  assert.equal(await total(), 700); // (300 - 20) / 28 days * 7 days * 10
  assert.equal(await total({ planDate: "2026-07-31" }), 560);
  assert.equal(await total({ visitCycleDays: 14 }), 1_400);
  assert.equal(await total({ from: "2026-07-01", to: "2026-07-01" }), 21_000);
  assert.equal(await total({ companyId: "missing-company" }), 0);
  allowed = new Set();
  assert.equal(await total(), 0);
  allowed = null;
  assert.equal(await total(), 1_400);
  assert.equal(await total({ customerCodes: ["C-1"] }), 700);
  await insert("Price List", { PriceListCode: "PL", ProductCode: "P", Unit: "case", Status: "Active", StartDate: "2026-08-02", PriceAfterVAT: 10.5 });
  assert.equal(await total({ customerCodes: ["C-1"] }), 735);
});
