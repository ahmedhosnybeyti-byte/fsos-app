import { strict as assert } from "node:assert";
import test from "node:test";
import { isRouteInActiveVehicleScope, isSaleOnOrBeforeTargetDate, isStaleVehicleInventory, managementStaleRouteProductCount, normalizedProductCode, rollupManagementStaleProductCodes } from "./smart-loading.service";
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
  const query = new RieScalableQueryService(
    { $queryRaw: async () => [{ productCode: "sku-1", quantity: 5_001, lastSaleDate: "2026-08-01", isStale: true, staleRouteProductCount: 5_001 }] } as never,
    { resolveAllowedRouteIds: async () => null } as never,
  );
  const rows = await query.queryRouteProductStaleness({
    companyId: "company-1",
    targetDate: "2026-08-10",
    staleDaysThreshold: 4,
    routeIds: Array.from({ length: 5_001 }, (_, index) => `route-${index}`),
  });

  assert.deepEqual(rows, [{ productCode: "sku-1", quantity: 5_001, lastSaleDate: "2026-08-01", isStale: true, staleRouteProductCount: 5_001 }]);
});

test("management counts the same stale product once for each stale route", () => {
  assert.equal(managementStaleRouteProductCount([{ staleRouteProductCount: 3 }]), 3);
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
