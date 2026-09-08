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
