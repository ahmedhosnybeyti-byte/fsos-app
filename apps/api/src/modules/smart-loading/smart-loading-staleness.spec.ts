import { strict as assert } from "node:assert";
import test from "node:test";
import { isRouteInActiveVehicleScope, isSaleOnOrBeforeTargetDate, isStaleVehicleInventory, managementStaleRouteProductCases, managementStaleRouteProductCount, normalizedProductCode, rollupManagementStaleProductCodes, SmartLoadingService } from "./smart-loading.service";
import { RieScalableQueryService } from "../rie/scalable-query.service";

const asOfDate = new Date("2026-08-10T00:00:00.000Z");
const daysAgo = (days: number) => asOfDate.getTime() - days * 86_400_000;

test("marks vehicle stock with a six-day-old sale stale at a four-day threshold", () => {
  assert.equal(isStaleVehicleInventory(10, daysAgo(6), asOfDate, 4), true);
});

test("recalculates the same SKU as not stale at a seven-day threshold", () => {
  assert.equal(isStaleVehicleInventory(10, daysAgo(6), asOfDate, 7), false);
});

test("never marks zero vehicle inventory as stale", () => {
  assert.equal(isStaleVehicleInventory(0, daysAgo(6), asOfDate, 4), false);
});

test("keeps the exact threshold boundary out of stale items", () => {
  assert.equal(isStaleVehicleInventory(10, daysAgo(4), asOfDate, 4), false);
});

test("uses the invoice-item route before the invoice-header fallback and ignores route-id casing", () => {
  const activeRoutes = new Set(["rt-12"]);
  assert.equal(isRouteInActiveVehicleScope("rt-12", "RT-99", activeRoutes), true);
  assert.equal(isRouteInActiveVehicleScope("", "RT-12", activeRoutes), true);
  assert.equal(isRouteInActiveVehicleScope("RT-99", "RT-12", activeRoutes), false);
});

test("uses one SKU key for stock and invoice items despite casing or whitespace", () => {
  const stockSku = normalizedProductCode(" P-080 ");
  const invoiceItemSku = normalizedProductCode("p-080");
  assert.equal(stockSku, invoiceItemSku);

  const purchases = new Map([[invoiceItemSku, "customer"]]);
  assert.equal(purchases.get(normalizedProductCode("P-080")), "customer");
});

test("excludes sales posted after the selected operational date", () => {
  assert.equal(isSaleOnOrBeforeTargetDate(Date.parse("2026-12-31T12:00:00.000Z"), "2026-12-31"), true);
  assert.equal(isSaleOnOrBeforeTargetDate(Date.parse("2027-01-01T00:00:00.000Z"), "2026-12-31"), false);
});

test("marks the four RT-12 stocked SKUs stale on 2026-12-31 at a four-day threshold", () => {
  for (const lastSaleDate of ["2026-12-23", "2026-12-26", "2026-12-23", "2026-12-23"]) {
    assert.equal(isStaleVehicleInventory(1, Date.parse(`${lastSaleDate}T00:00:00.000Z`), new Date("2026-12-31T00:00:00.000Z"), 4), true);
  }
});

test("management rollup keeps Route B stale when the same SKU sold on Route A", () => {
  const key = (routeId: string, productCode: string) => `${routeId}\u0000${productCode}`;
  const stock = new Map([
    [key("route-a", "sku-1"), 5],
    [key("route-b", "sku-1"), 5],
  ]);
  const lastSales = new Map([
    [key("route-a", "sku-1"), Date.parse("2026-08-09T00:00:00.000Z")],
    [key("route-b", "sku-1"), Date.parse("2026-08-01T00:00:00.000Z")],
  ]);

  assert.deepEqual([...rollupManagementStaleProductCodes(stock, lastSales, asOfDate, 4)], ["sku-1"]);
});

test("management RIE stale rollup returns Product grain for more than 5,000 route scopes", async () => {
  const expected = [{
    productCode: "sku-1",
    quantity: 5_001,
    lastSaleDate: "2026-08-01",
    isStale: true,
    staleRouteProductCount: 5_001,
    staleRouteProducts: Array.from({ length: 5_001 }, (_, index) => ({ routeId: `route-${index}`, currentVehicleStock: 1, lastSaleDate: "2026-08-01" })),
  }];
  const query = new RieScalableQueryService(
    { $queryRaw: async (sql: { strings?: readonly string[] }) => (sql.strings?.join(" ").includes('COUNT(*) AS "versionCount"')
      ? [
        { entityName: "Van Inventory", versionCount: 1 },
        { entityName: "Invoices", versionCount: 1 },
        { entityName: "Invoice Items", versionCount: 1 },
      ]
      : expected) } as never,
    { resolveAllowedRouteIds: async () => null } as never,
  );
  const rows = await query.queryRouteProductStaleness({
    companyId: "company-1",
    targetDate: "2026-08-10",
    staleDaysThreshold: 4,
    routeIds: Array.from({ length: 5_001 }, (_, index) => `route-${index}`),
  });

  assert.deepEqual(rows, expected);
  assert.equal(rows[0]?.staleRouteProducts.length, 5_001);
});

test("route-product staleness uses direct CTEs and preserves its single-version result", async () => {
  const expected = [{ productCode: "sku-1", quantity: 2, lastSaleDate: "2026-08-01", isStale: true, staleRouteProductCount: 1, staleRouteProducts: [] }];
  let statement: { strings?: readonly string[] } | undefined;
  const query = new RieScalableQueryService(
    { $queryRaw: async (sql: { strings?: readonly string[] }) => {
      if (sql.strings?.join(" ").includes('COUNT(*) AS "versionCount"')) {
        return [
          { entityName: "Van Inventory", versionCount: 1 },
          { entityName: "Invoices", versionCount: 1 },
          { entityName: "Invoice Items", versionCount: 1 },
        ];
      }
      statement = sql;
      return expected;
    } } as never,
    { resolveAllowedRouteIds: async () => null } as never,
  );

  const rows = await query.queryRouteProductStaleness({ companyId: "company-1", targetDate: "2026-08-10", staleDaysThreshold: 4 });

  assert.deepEqual(rows, expected);
  const sql = statement?.strings?.join(" ") ?? "";
  assert.doesNotMatch(sql, /inventory_candidates|invoice_candidates|item_candidates|MIN\(candidate_version\.precedence\) OVER/);
  assert.match(sql, /inventory_active AS MATERIALIZED/);
  assert.match(sql, /invoice_active AS MATERIALIZED/);
  assert.match(sql, /item_active AS MATERIALIZED/);
  assert.doesNotMatch(sql, /SELECT inventory_source\.\*/);
  assert.doesNotMatch(sql, /SELECT invoice_source\.\*/);
  assert.doesNotMatch(sql, /SELECT item_source\.\*/);
});

test("route-product staleness keeps newest-wins CTEs when any entity has multiple active versions", async () => {
  let statement: { strings?: readonly string[] } | undefined;
  const query = new RieScalableQueryService(
    { $queryRaw: async (sql: { strings?: readonly string[] }) => {
      if (sql.strings?.join(" ").includes('COUNT(*) AS "versionCount"')) {
        return [
          { entityName: "Van Inventory", versionCount: 2 },
          { entityName: "Invoices", versionCount: 1 },
          { entityName: "Invoice Items", versionCount: 3 },
        ];
      }
      statement = sql;
      return [];
    } } as never,
    { resolveAllowedRouteIds: async () => null } as never,
  );

  await query.queryRouteProductStaleness({ companyId: "company-1", targetDate: "2026-08-10", staleDaysThreshold: 4 });

  const sql = statement?.strings?.join(" ") ?? "";
  assert.match(sql, /inventory_candidates/);
  assert.doesNotMatch(sql, /invoice_candidates/);
  assert.match(sql, /item_candidates/);
  assert.doesNotMatch(sql, /SELECT inventory_source\.\*/);
  assert.doesNotMatch(sql, /SELECT invoice_source\.\*/);
  assert.doesNotMatch(sql, /SELECT item_source\.\*/);
});

test("management vehicle monitor returns every inventory product at Product grain for a large route scope", async () => {
  const expected = [
    { productCode: "sku-a", currentVehicleStock: 10, weeklyAverageSales: 2, alignmentPercent: 100 },
    { productCode: "sku-b", currentVehicleStock: 1, weeklyAverageSales: 0, alignmentPercent: 100 },
  ];
  let statement: { strings: readonly string[] } | undefined;
  const query = new RieScalableQueryService(
    { $queryRaw: async (sql: { strings: readonly string[] }) => { statement = sql; return expected; } } as never,
    { resolveAllowedRouteIds: async () => null } as never,
  );
  const rows = await query.queryManagementVehicleProducts({
    companyId: "company-1",
    targetDate: "2026-08-10",
    salesFrom: "2026-05-10",
    salesTo: "2026-08-10",
    customerCodes: ["customer-a", "customer-b"],
    routeIds: Array.from({ length: 5_001 }, (_, index) => `route-${index}`),
  });

  assert.deepEqual(rows, expected);
  assert.match(statement!.strings.join("?"), /FULL OUTER JOIN sales_by_route_product/);
  assert.match(statement!.strings.join("?"), /GROUP BY product_code/);
  assert.match(statement!.strings.join("?"), /SUM\(LEAST\(current_stock, weekly_average_sales\)\)/);
  assert.match(statement!.strings.join("?"), /scoped_invoice_numbers/);
  assert.doesNotMatch(statement!.strings.join("?"), /SELECT inventory_source\.\*/);
  assert.doesNotMatch(statement!.strings.join("?"), /SELECT invoice_source\.\*/);
  assert.doesNotMatch(statement!.strings.join("?"), /SELECT item_source\.\*/);
});

test("management stock alignment keeps Route A's shortage despite Route B's surplus", async () => {
  const expected = { alignmentPercent: 85, categoryAlignments: [] };
  let statement: { strings: readonly string[] } | undefined;
  const query = new RieScalableQueryService(
    { $queryRaw: async (sql: { strings: readonly string[] }) => { statement = sql; return [expected]; } } as never,
    { resolveAllowedRouteIds: async () => null } as never,
  );
  const result = await query.queryManagementStockAlignment({
    companyId: "company-1",
    routeIds: ["route-a", "route-b"],
    targetDate: "2026-08-10",
    salesFrom: "2026-05-10",
    salesTo: "2026-08-10",
    customerCodes: ["customer-a", "customer-b"],
  });

  // Route A: MIN(7, 10) = 7; Route B: MIN(15, 10) = 10; 17 / 20 = 85%.
  assert.equal(result.alignmentPercent, 85);
  assert.match(statement!.strings.join("?"), /FULL OUTER JOIN expected_by_route_product/);
  assert.match(statement!.strings.join("?"), /SUM\(LEAST\(current_stock, expected_sales\)\)/);
  assert.match(statement!.strings.join("?"), /category_alignment/);
});

test("management Smart Loading bundle shares scoped foundations and acquires one expensive permit", async () => {
  const expected = {
    routeProductStaleness: [{
      productCode: "sku-a", quantity: 17, lastSaleDate: "2026-08-01", isStale: true,
      staleRouteProductCount: 1,
      staleRouteProducts: [{ routeId: "route-a", currentVehicleStock: 7, lastSaleDate: "2026-08-01" }],
    }],
    stockAlignment: { alignmentPercent: 85, categoryAlignments: [{ category: "Food", alignmentPercent: 85 }] },
    vehicleProducts: [{ productCode: "sku-a", currentVehicleStock: 17, weeklyAverageSales: 20, alignmentPercent: 85 }],
  };
  let rawQueryCount = 0;
  let statement: { strings?: readonly string[]; values?: readonly unknown[] } | undefined;
  const acquiredOperations: string[] = [];
  const query = new RieScalableQueryService({
    $queryRaw: async (sql: { strings?: readonly string[]; values?: readonly unknown[] }) => {
      rawQueryCount += 1;
      if ((sql.strings?.join(" ") ?? "").includes('COUNT(*) AS "versionCount"')) {
        return [
          { entityName: "Van Inventory", versionCount: 1 },
          { entityName: "Invoices", versionCount: 2 },
          { entityName: "Invoice Items", versionCount: 2 },
          { entityName: "Products", versionCount: 1 },
        ];
      }
      statement = sql;
      return [expected];
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["route-a", "route-b"]) } as never);
  (query as unknown as { logger: { log(message: string): void } }).logger = {
    log: (message) => {
      const event = JSON.parse(message) as { event?: string; operation?: string };
      if (event.event === "rie_expensive_query_acquired" && event.operation) acquiredOperations.push(event.operation);
    },
  };

  const result = await query.queryManagementSmartLoadingBundle({
    companyId: "company-1",
    requestingUser: { roleCode: "MANAGER", email: "manager@example.com" },
    routeIds: ["route-a", "outside-route"],
    targetDate: "2026-08-10",
    staleDaysThreshold: 4,
    salesFrom: "2026-05-10",
    salesTo: "2026-08-09",
    customerCodes: ["Customer-A"],
  });

  assert.deepEqual(result, expected);
  assert.equal(rawQueryCount, 2, "metadata and bundle SQL should execute under the same permit");
  assert.deepEqual(acquiredOperations, ["queryManagementSmartLoadingBundle"]);
  const sql = statement?.strings?.join("?") ?? "";
  assert.match(sql, /stock_by_route_product AS MATERIALIZED/);
  assert.equal((sql.match(/stock_by_route_product AS MATERIALIZED/g) ?? []).length, 1);
  assert.match(sql, /stale_scoped_invoice_numbers AS MATERIALIZED/);
  assert.match(sql, /window_scoped_invoice_numbers AS MATERIALIZED/);
  assert.match(sql, /window_sales_by_route_product AS MATERIALIZED/);
  assert.match(sql, /stale_invoice_candidates/);
  assert.match(sql, /window_invoice_candidates/);
  assert.match(sql, /stale_item_candidates/);
  assert.match(sql, /window_item_candidates/);
  assert.doesNotMatch(sql, /inventory_candidates|product_candidates/);
  assert.doesNotMatch(sql, /SELECT\s+\w+_source\.\*/);
  assert.doesNotMatch(sql, /CROSS JOIN/);
  assert.ok(statement?.values?.includes("route-a"));
  assert.ok(!statement?.values?.includes("outside-route"));
  assert.ok(statement?.values?.includes("customer-a"));
  assert.ok(statement?.values?.includes("2026-05-10"));
  assert.ok(statement?.values?.includes("2026-08-09"));
  assert.ok(statement?.values?.includes("2026-08-10"));
});

test("management heavy Promise section acquires exactly two RIE permits", async () => {
  const acquiredOperations: string[] = [];
  const query = new RieScalableQueryService({
    $queryRaw: async (sql: { strings?: readonly string[] }) => {
      const text = sql.strings?.join(" ") ?? "";
      if (text.includes('COUNT(*) AS "versionCount"')) {
        return [
          { entityName: "Van Inventory", versionCount: 1 },
          { entityName: "Invoices", versionCount: 1 },
          { entityName: "Invoice Items", versionCount: 1 },
          { entityName: "Products", versionCount: 1 },
        ];
      }
      if (text.includes('AS "latestReportDate"')) return [{ routeId: "route-a", latestReportDate: "2026-08-10" }];
      return [{
        routeProductStaleness: [],
        stockAlignment: { alignmentPercent: 100, categoryAlignments: [] },
        vehicleProducts: [],
      }];
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["route-a"]) } as never);
  (query as unknown as { logger: { log(message: string): void } }).logger = {
    log: (message) => {
      const event = JSON.parse(message) as { event?: string; operation?: string };
      if (event.event === "rie_expensive_query_acquired" && event.operation) acquiredOperations.push(event.operation);
    },
  };
  const common = {
    companyId: "company-1",
    requestingUser: { roleCode: "SUPERVISOR", email: "supervisor@example.com" },
    routeIds: ["route-a"],
    targetDate: "2026-08-10",
  } as const;

  await Promise.all([
    query.queryManagementActiveVehicleRoutes(common),
    query.queryManagementSmartLoadingBundle({
      ...common, staleDaysThreshold: 4, salesFrom: "2026-05-10", salesTo: "2026-08-10", customerCodes: ["customer-a"],
    }),
  ]);

  assert.deepEqual(acquiredOperations.sort(), ["queryManagementActiveVehicleRoutes", "queryManagementSmartLoadingBundle"]);
});

test("management session uses the unified bundle and never calls the three compatibility methods", async () => {
  let bundleCalls = 0;
  let activeRouteCalls = 0;
  const facade = {
    queryCanonicalRecords: async () => ({ records: [], page: { limit: 5_000, offset: 0, hasMore: false } }),
    queryManagementActiveVehicleRoutes: async () => { activeRouteCalls += 1; return []; },
    queryManagementSmartLoadingBundle: async () => {
      bundleCalls += 1;
      return {
        routeProductStaleness: [],
        stockAlignment: { alignmentPercent: 100, categoryAlignments: [] },
        vehicleProducts: [],
      };
    },
    queryRouteProductStaleness: async () => { throw new Error("legacy staleness call must not run"); },
    queryManagementStockAlignment: async () => { throw new Error("legacy alignment call must not run"); },
    queryManagementVehicleProducts: async () => { throw new Error("legacy vehicle call must not run"); },
  };
  const service = new SmartLoadingService(
    facade as never,
    { detect: async () => ({ status: "no-customers", opportunities: [] }) } as never,
    {} as never,
    {} as never,
  );

  const session = await service.getSession({
    userId: "user-1", companyId: "company-1", email: "admin@example.com",
    roleCode: "COMPANY_ADMIN", permissions: [], mustChangePassword: false, orgUnitId: null,
  }, "2099-01-01", 4);

  assert.equal(session.state, "ready");
  assert.equal(bundleCalls, 1);
  assert.equal(activeRouteCalls, 1);
  if (session.state === "ready") {
    assert.equal(session.managementStockAlignmentPercent, 100);
    assert.deepEqual(session.managementVehicleProducts, []);
  }
});

test("Sales Rep session keeps the existing non-management path", async () => {
  let genericCalls = 0;
  const facade = {
    queryCanonicalRecords: async () => {
      genericCalls += 1;
      return { records: [], page: { limit: 5_000, offset: 0, hasMore: false } };
    },
    queryManagementActiveVehicleRoutes: async () => { throw new Error("management active routes must not run"); },
    queryManagementSmartLoadingBundle: async () => { throw new Error("management bundle must not run"); },
  };
  const service = new SmartLoadingService(
    facade as never,
    { detect: async () => ({ status: "no-customers", opportunities: [] }) } as never,
    {} as never,
    {} as never,
  );

  const session = await service.getSession({
    userId: "rep-1", companyId: "company-1", email: "rep@example.com",
    roleCode: "SALES_REP", permissions: [], mustChangePassword: false, orgUnitId: null,
  }, "2099-01-01", 4);

  assert.equal(session.state, "ready");
  assert.equal(genericCalls, 4);
  if (session.state === "ready") {
    assert.equal(session.managementStockAlignmentPercent, null);
    assert.equal(session.managementVehicleProducts, null);
    assert.equal(session.managementStaleRouteProducts, null);
  }
});

test("management counts the same stale product once for each stale route", () => {
  assert.equal(managementStaleRouteProductCount([{ staleRouteProductCount: 3 }]), 3);
});

test("management popup retains three stale Route × Product cases for the same product", () => {
  const cases = managementStaleRouteProductCases([{ productCode: "sku-1", staleRouteProducts: [
    { routeId: "route-a", currentVehicleStock: 1, lastSaleDate: "2026-08-01" },
    { routeId: "route-b", currentVehicleStock: 1, lastSaleDate: "2026-08-01" },
    { routeId: "route-c", currentVehicleStock: 1, lastSaleDate: "2026-08-01" },
  ] }]);
  assert.equal(cases.length, 3);
  assert.deepEqual(cases.map((item) => item.routeId), ["route-a", "route-b", "route-c"]);
});

test("stale purchases keep the same evidence past 5,000 Product × Customer rows without a bounded response", async () => {
  const expected = [{
    productCode: "sku-1",
    customers: Array.from({ length: 5_001 }, (_, index) => ({
      customerCode: `customer-${index}`,
      customerName: `Customer ${index}`,
      totalQuantity: 1,
      purchaseFrequency: 1,
      lastPurchaseDate: "2026-08-01",
    })),
  }];
  const query = new RieScalableQueryService(
    { $queryRaw: async () => expected } as never,
    { resolveAllowedRouteIds: async () => null } as never,
  );

  const rows = await query.queryStalePurchases({
    companyId: "company-1",
    routeIds: ["route-1"],
    productCodes: ["sku-1"],
    targetDate: "2026-08-10",
  });

  assert.deepEqual(rows, expected);
  assert.equal(rows[0]?.customers.length, 5_001);
});
