import { strict as assert } from "node:assert";
import test from "node:test";
import { SmartLoadingService } from "./smart-loading.service";
import { RieScalableQueryService } from "../rie/scalable-query.service";

const user = {
  userId: "user-1",
  companyId: "company-1",
  email: "rep@example.com",
  roleCode: "SALES_REP",
  permissions: [],
  mustChangePassword: false,
  orgUnitId: null,
} as const;

const calculate = async (netQuantity: number, confirmedOrderQuantity = 0, vehicleStock = 0) => {
  let netQuery: Record<string, unknown> | undefined;
  const facade = {
    hasCanonicalEntitySources: async () => true,
    querySmartLoadingNetQuantities: async (query: Record<string, unknown>) => {
      netQuery = query;
      return [{ productCode: "P-1", netQuantity }];
    },
    queryCanonicalRecords: async (query: { entityName: string; aggregates?: readonly { as: string }[] }) => {
      if (query.entityName === "Customers") return { records: [{ customerCode: "C-1" }], page: { hasMore: false } };
      if (query.entityName === "Van Inventory" && query.aggregates?.some((aggregate) => aggregate.as === "latestReportDate")) {
        return { records: [{ latestReportDate: "2026-09-07" }], page: { hasMore: false } };
      }
      if (query.entityName === "Van Inventory") return { records: [{ productCode: "P-1", quantity: vehicleStock }], page: { hasMore: false } };
      if (query.entityName === "Products") return { records: [{ productCode: "P-1", productName: "Product 1" }], page: { hasMore: false } };
      throw new Error(`unexpected entity ${query.entityName}`);
    },
  };
  const service = new SmartLoadingService(facade as never, {} as never, {} as never, {} as never, {} as never);
  const result = await service.recalculate(user as never, {
    targetDate: "2026-09-08",
    fromDate: "2026-09-01",
    toDate: "2026-09-07",
    visitsPerWeek: 1,
    staleDaysThreshold: 4,
    customerCodes: ["C-1"],
    confirmedOrders: confirmedOrderQuantity ? [{ productCode: "P-1", quantity: confirmedOrderQuantity }] : [],
  });
  return { result, netQuery };
};

test("Sales Rep demand preserves gross behavior when returns are zero", async () => {
  const { result } = await calculate(100);
  assert.equal(result.products[0]?.estimatedCustomerDemand, 100);
  assert.equal(result.products[0]?.suggestedQuantity, 100);
});

test("Sales Rep demand uses period net quantity and preserves orders and vehicle stock", async () => {
  const { result, netQuery } = await calculate(80, 10, 5);
  assert.equal(result.products[0]?.estimatedCustomerDemand, 80);
  assert.equal(result.products[0]?.suggestedQuantity, 85);
  assert.deepEqual(netQuery?.customerCodes, ["C-1"]);
  assert.equal(netQuery?.fromDate, "2026-09-01");
  assert.equal(netQuery?.toDate, "2026-09-07");
});

test("Sales Rep clamps only the completed period net quantity", async () => {
  const { result } = await calculate(-5);
  assert.equal(result.products[0]?.estimatedCustomerDemand, 0);
  assert.equal(result.products[0]?.suggestedQuantity, 0);
});

test("Smart Loading SQL is canonical, scoped, aggregated, and returns-aware without fact fan-out", async () => {
  const queries: Array<{ text?: string; strings?: readonly string[]; values?: readonly unknown[] }> = [];
  const service = new RieScalableQueryService({
    $queryRaw: async (query: { text?: string; strings?: readonly string[]; values?: readonly unknown[] }) => {
      queries.push(query);
      return [];
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["route-1"]) } as never);

  await service.querySmartLoadingNetQuantities({
    companyId: "company-1",
    requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" },
    routeIds: ["route-1"],
    customerCodes: ["customer-1"],
    fromDate: "2026-09-01",
    toDate: "2026-09-07",
  });
  await service.queryManagementVehicleProducts({
    companyId: "company-1", routeIds: ["route-1"], customerCodes: ["customer-1"],
    targetDate: "2026-09-08", salesFrom: "2026-06-01", salesTo: "2026-09-01",
  });
  await service.queryManagementSmartLoadingBundle({
    companyId: "company-1", routeIds: ["route-1"], customerCodes: ["customer-1"],
    targetDate: "2026-09-08", salesFrom: "2026-06-01", salesTo: "2026-09-01", staleDaysThreshold: 4,
  });
  await service.queryManagementLoadingRisk({
    companyId: "company-1", targetDate: "2026-09-08", salesFrom: "2026-06-01", salesTo: "2026-09-01", personLevel: "sales_rep",
    requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" },
  });

  assert.equal(queries.length, 4);
  for (const query of queries) {
    const sql = query.text ?? query.strings?.join(" ") ?? "";
    const values = JSON.stringify(query.values ?? []);
    const statement = `${sql}\n${values}`;
    assert.match(sql, /rie_canonical_entity_rows/);
    assert.match(values, /Return Items/);
    assert.match(statement, /confirmed/);
    assert.match(statement, /approved/);
    assert.match(sql, /scoped_return_numbers|window_scoped_return_numbers/);
    assert.match(sql, /GREATEST\(net_quantity, 0\)|sold_quantity - COALESCE\(returned\.returned_quantity, 0\)/);
    assert.doesNotMatch(sql, /rie_entity_rows|rie_dataset_versions|ROW_NUMBER\(\) OVER|source\.\*/);
    assert.doesNotMatch(sql, /LIMIT|OFFSET/);
  }
  for (const query of queries.slice(1)) {
    const sql = query.text ?? query.strings?.join(" ") ?? "";
    assert.doesNotMatch(sql, /InvoiceStatus/);
    assert.match(sql, /12\.0/);
  }
});
