import { strict as assert } from "node:assert";
import test from "node:test";
import { isRouteInActiveVehicleScope, isSaleOnOrBeforeTargetDate, isStaleVehicleInventory, normalizedProductCode } from "./smart-loading.service";

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
