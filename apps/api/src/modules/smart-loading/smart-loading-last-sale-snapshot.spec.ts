import assert from "node:assert/strict";
import test from "node:test";
import { lastSaleMsByProductFromRouteRows } from "./smart-loading.service";

test("last-sale snapshot inputs preserve the live Route × Product MAX for the same routes and target date", () => {
  const liveRows = [
    { routeId: "r-1", productCode: "sku-a", lastSaleDate: "2026-09-11" },
    { routeId: "r-2", productCode: "SKU-A", lastSaleDate: "2026-09-15" },
    { routeId: "r-2", productCode: "sku-b", lastSaleDate: "2026-09-13" },
  ];
  const snapshotRows = liveRows.map(({ productCode, lastSaleDate }) => ({ productCode, lastSaleDate }));
  assert.deepEqual([...lastSaleMsByProductFromRouteRows(snapshotRows)], [...lastSaleMsByProductFromRouteRows(liveRows)]);
});
