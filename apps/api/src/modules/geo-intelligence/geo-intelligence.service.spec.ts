import { strict as assert } from "node:assert";
import test from "node:test";
import { GeoIntelligenceService } from "./geo-intelligence.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

const user: AuthenticatedUser = { userId: "u", companyId: "company-1", email: "rep@example.test", roleCode: "SALES_REP", permissions: [], mustChangePassword: false, orgUnitId: null };

function serviceWithSqlResult() {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const rie = {
    queryGeoCustomerSelection: async (input: Record<string, unknown>) => {
      calls.push({ name: "customers", input });
      return input.targetCustomerId
        ? [
            { id: "target", name: "Target", lat: 24.7, lon: 46.7, distanceKm: 0, source: "target", excludedBadCoordinates: 1 },
            { id: "near", name: "Near", lat: 24.71, lon: 46.71, distanceKm: 1.5, source: "auto", excludedBadCoordinates: 1 },
          ]
        : [{ id: "near", name: "Near", lat: 24.71, lon: 46.71, distanceKm: 1.5, source: "auto", excludedBadCoordinates: 1 }];
    },
    queryGeoProducts: async (input: Record<string, unknown>) => {
      calls.push({ name: "products", input });
      return [{ sku: "P-1", name: "Product", category: "Food", totalQty: 3, totalValue: 30, customerCount: 1, totalRowsConsidered: 9, targetProductCount: input.excludeCustomerId ? 2 : null }];
    },
  };
  return { service: new GeoIntelligenceService({} as never, {} as never, rie as never), calls };
}

test("new-customer product intelligence preserves its result contract while facts stay in SQL", async () => {
  const { service, calls } = serviceWithSqlResult();
  const result = await service.analyze(user, { location: { lat: 24.7, lon: 46.7 }, mode: "auto", nearestCount: 3, manualCustomerIds: [], topProductsLimit: 5 });
  assert.deepEqual(result.topProducts, [{ sku: "P-1", name: "Product", category: "Food", totalQty: 3, totalValue: 30, customerCount: 1 }]);
  assert.equal(result.totalRowsConsidered, 9);
  assert.equal(calls.filter((call) => call.name === "customers").length, 1);
  assert.equal(calls.filter((call) => call.name === "products").length, 1);
  assert.deepEqual(calls.find((call) => call.name === "products")?.input.customerIds, ["near"]);
});

test("customer comparison preserves target exclusions and recommendation output", async () => {
  const { service, calls } = serviceWithSqlResult();
  const result = await service.compareCustomerViaRie(user, { targetCustomerId: "target", nearestCount: 3, topProductsLimit: 5 });
  assert.equal(result.targetProductCount, 2);
  assert.deepEqual(result.gapProducts, [{ sku: "P-1", name: "Product", category: "Food", totalQty: 3, totalValue: 30, customerCount: 1 }]);
  const productCall = calls.find((call) => call.name === "products");
  assert.equal(productCall?.input.excludeCustomerId, "target");
  assert.deepEqual(productCall?.input.customerIds, ["near"]);
});

test("Geo customer pickers use the prepared SQL directory and preserve sorting", async () => {
  const calls: Record<string, unknown>[] = [];
  const facade = { hasCanonicalEntitySources: async () => true };
  const scalable = {
    queryGeoCustomerDirectory: async (input: Record<string, unknown>) => {
      calls.push(input);
      return [
        { id: "C-2", name: "Zulu", lat: 24.8, lon: 46.8 },
        { id: "C-1", name: "Alpha", lat: 24.7, lon: 46.7 },
      ];
    },
  };
  const service = new GeoIntelligenceService({} as never, facade as never, scalable as never);

  assert.deepEqual(await service.listCustomers(user, { search: "alp" }), {
    customers: [
      { id: "C-1", name: "Alpha", lat: 24.7, lon: 46.7 },
      { id: "C-2", name: "Zulu", lat: 24.8, lon: 46.8 },
    ],
  });
  assert.deepEqual(await service.listCustomersViaRie(user, { search: "zul" }), {
    customers: [
      { id: "C-1", name: "Alpha", lat: 24.7, lon: 46.7 },
      { id: "C-2", name: "Zulu", lat: 24.8, lon: 46.8 },
    ],
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.search, "alp");
  assert.equal(calls[1]?.search, "zul");
});

test("Geo expansion keeps its result contract while Customers and sales arrive already scoped/projected", async () => {
  const expansionCalls: Record<string, unknown>[] = [];
  const facade = {
    hasCanonicalEntitySources: async () => true,
  };
  const scalable = {
    queryGeoExpansionCustomers: async (input: Record<string, unknown>) => {
      expansionCalls.push(input);
      return {
        matchedScopeRows: 3,
        customers: [
          { id: "C-1", name: "One", lat: 24.7, lon: 46.7 },
          { id: "C-2", name: "Two", lat: 24.71, lon: 46.71 },
          { id: "C-3", name: "Three", lat: 24.72, lon: 46.72 },
        ],
      };
    },
    queryGeoCustomerSales: async () => [
      { customerCode: "C-1", total: 100 },
      { customerCode: "C-2", total: 200 },
      { customerCode: "C-3", total: 300 },
      { customerCode: "C-4", total: 999 },
    ],
  };
  const service = new GeoIntelligenceService({} as never, facade as never, scalable as never);
  const result = await service.expansion(user, { gridSizeKm: 1, scopeField: "City", scopeValues: ["North"] });

  assert.equal(result.customerCount, 3);
  assert.equal(result.gridSizeKm, 1);
  assert.ok(result.totalCells > 0);
  assert.ok(result.points.every((point) => point.value <= 600));
  assert.equal(expansionCalls.length, 1);
  assert.deepEqual(expansionCalls[0]?.exactScope, { field: "City", values: ["North"] });
});

test("Geo expansion scope values retain legacy trim, dedupe, and locale ordering", async () => {
  const facade = {
    hasCanonicalEntitySources: async () => true,
    queryCanonicalRecords: async () => ({
      records: [{ value: " Riyadh " }, { value: "Riyadh" }, { value: "" }, { value: "Jeddah" }],
      page: { limit: 0, offset: 0, hasMore: false },
    }),
  };
  const service = new GeoIntelligenceService({} as never, facade as never, {} as never);
  assert.deepEqual(await service.expansionScopeValues(user, "City"), { values: ["Jeddah", "Riyadh"] });
});

test("Geo expansion distinguishes an empty scope from a scope containing only invalid coordinates", async () => {
  let matchedScopeRows = 0;
  const facade = { hasCanonicalEntitySources: async () => true };
  const scalable = {
    queryGeoExpansionCustomers: async () => ({ customers: [], matchedScopeRows }),
    queryGeoCustomerSales: async () => [],
  };
  const service = new GeoIntelligenceService({} as never, facade as never, scalable as never);
  const input = { gridSizeKm: 1, scopeField: "City" as const, scopeValues: ["North"] };

  await assert.rejects(() => service.expansion(user, input), /لا توجد بيانات مطابقة/);
  matchedScopeRows = 1;
  await assert.rejects(() => service.expansion(user, input), /محتاج على الأقل 3 عملاء/);
});
